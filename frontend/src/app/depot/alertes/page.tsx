'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';

type Severite = 'info' | 'attention' | 'critique';
type TypeAlerte = 'rupture_stock' | 'ecart_caisse';

interface Alerte {
  id: string;
  typeAlerte: TypeAlerte;
  severite: Severite;
  details: Record<string, unknown> | null;
  vue: boolean;
  resolue: boolean;
  resolutionNote: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<TypeAlerte, string> = {
  rupture_stock: 'Rupture de stock',
  ecart_caisse: 'Écart de caisse',
};

const SEVERITE_STYLES: Record<Severite, { label: string; className: string }> = {
  critique: { label: 'Critique', className: 'bg-[#d03b3b]/10 text-[#d03b3b]' },
  attention: { label: 'Attention', className: 'bg-[#d08a1c]/10 text-[#d08a1c]' },
  info: { label: 'Info', className: 'bg-[#898781]/10 text-[#898781]' },
};

// Details vary by rule (§ 6.1-6.2 each store different fields) — rendered
// generically as "clé : valeur" rather than special-cased per type, so this
// never drifts from what lib/server/depot/alertes.ts actually persists.
function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return '';
  return Object.entries(details)
    .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
}

function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const selectClass =
  'rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none';

export default function DepotAlertesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [severiteFilter, setSeveriteFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statutFilter, setStatutFilter] = useState('');

  const [noteTarget, setNoteTarget] = useState<Alerte | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (severiteFilter) params.set('severite', severiteFilter);
      if (typeFilter) params.set('typeAlerte', typeFilter);
      if (statutFilter) params.set('statut', statutFilter);
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      return qs ? `?${qs}` : '';
    },
    [severiteFilter, typeFilter, statutFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: Alerte[]; nextCursor: string | null }>(
        `/api/depot/alertes${buildQuery()}`,
      );
      setAlertes(res.items);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await api<{ items: Alerte[]; nextCursor: string | null }>(
        `/api/depot/alertes${buildQuery(nextCursor)}`,
      );
      setAlertes((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function markVue(a: Alerte) {
    if (a.vue) return;
    setBusyId(a.id);
    try {
      const updated = await api<Alerte>(`/api/depot/alertes/${a.id}`, {
        method: 'PATCH',
        body: { vue: true },
      });
      setAlertes((prev) => prev.map((x) => (x.id === a.id ? updated : x)));
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  function openNote(a: Alerte) {
    setNoteTarget(a);
    setNoteText(a.resolutionNote ?? '');
    setNoteError(null);
  }

  async function saveNote() {
    if (!noteTarget) return;
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      const updated = await api<Alerte>(`/api/depot/alertes/${noteTarget.id}`, {
        method: 'PATCH',
        body: { resolutionNote: noteText.trim() },
      });
      setAlertes((prev) => prev.map((x) => (x.id === noteTarget.id ? updated : x)));
      toast('Note enregistrée.');
      setNoteTarget(null);
    } catch (err) {
      setNoteError(friendlyError(err));
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function toggleResolue(next: boolean) {
    if (!noteTarget) return;
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      const body: Record<string, unknown> = { resolue: next };
      if (next && noteText.trim()) body.resolutionNote = noteText.trim();
      const updated = await api<Alerte>(`/api/depot/alertes/${noteTarget.id}`, {
        method: 'PATCH',
        body,
      });
      setAlertes((prev) => prev.map((x) => (x.id === noteTarget.id ? updated : x)));
      toast(next ? 'Alerte marquée résolue.' : 'Alerte rouverte.');
      setNoteTarget(null);
    } catch (err) {
      setNoteError(friendlyError(err));
    } finally {
      setNoteSubmitting(false);
    }
  }

  if (!user) return null;

  if (user.orgRole !== 'OWNER') {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="depot" />
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            Accès réservé au promoteur (propriétaire) du centre.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="depot" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/depot" className="hover:underline">
            Dépôt
          </Link>{' '}
          / Centre de notifications
        </p>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Centre de notifications</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Alertes automatiques du Dépôt — ruptures de stock, écarts de caisse.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            className={selectClass}
            value={severiteFilter}
            onChange={(e) => setSeveriteFilter(e.target.value)}
          >
            <option value="">Toutes sévérités</option>
            <option value="critique">Critique</option>
            <option value="attention">Attention</option>
            <option value="info">Info</option>
          </select>
          <select
            className={selectClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value)}
          >
            <option value="">Tous statuts</option>
            <option value="non_vue">Non vues</option>
            <option value="vue">Vues (non résolues)</option>
            <option value="resolue">Résolues</option>
          </select>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          {!loading && alertes.length === 0 && (
            <p className="rounded-md border border-dashed border-[#e1e0d9] px-4 py-10 text-center text-sm text-[#898781]">
              Aucune alerte pour ces filtres.
            </p>
          )}
          {alertes.map((a) => {
            const sev = SEVERITE_STYLES[a.severite];
            return (
              <div
                key={a.id}
                className={`rounded-lg border border-[#e1e0d9] bg-white p-4 ${!a.vue ? 'border-l-4 border-l-[#2a78d6]' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sev.className}`}
                      >
                        {sev.label}
                      </span>
                      <span className="font-medium text-[#0b0b0b]">
                        {TYPE_LABELS[a.typeAlerte]}
                      </span>
                      {a.resolue && (
                        <span className="inline-flex items-center rounded-full bg-[#0ca30c]/10 px-2 py-0.5 text-xs font-medium text-[#0ca30c]">
                          Résolue
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#898781]">{formatDateHeure(a.createdAt)}</p>
                    {a.details && (
                      <p className="mt-1.5 font-mono text-xs text-[#52514e]">
                        {formatDetails(a.details)}
                      </p>
                    )}
                    {a.resolutionNote && (
                      <p className="mt-2 rounded-md bg-[#f9f9f7] px-2.5 py-1.5 text-xs text-[#52514e]">
                        {a.resolutionNote}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {!a.vue && (
                      <button
                        type="button"
                        onClick={() => void markVue(a)}
                        disabled={busyId === a.id}
                        className="whitespace-nowrap rounded-md border border-[#e1e0d9] bg-white px-3 py-1.5 text-xs font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
                      >
                        Marquer vue
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openNote(a)}
                      className="whitespace-nowrap rounded-md border border-[#e1e0d9] bg-white px-3 py-1.5 text-xs font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
                    >
                      {a.resolue ? 'Modifier la note' : 'Résoudre / noter'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {nextCursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="mt-4 w-full rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
          >
            {loadingMore ? 'Chargement…' : 'Charger plus'}
          </button>
        )}
      </div>

      {noteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="mb-1 font-semibold text-[#0b0b0b]">
              {TYPE_LABELS[noteTarget.typeAlerte]}
            </h3>
            <p className="mb-3 text-sm text-[#52514e]">{formatDateHeure(noteTarget.createdAt)}</p>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Note
            </label>
            <textarea
              className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
              rows={3}
              placeholder="Ex: Réapprovisionnement PPM commandé, livraison prévue sous 5 jours."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            {noteError && (
              <p role="alert" className="mt-2 text-sm text-[#d03b3b]">
                {noteError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteTarget(null)}
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => void saveNote()}
                disabled={noteSubmitting}
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
              >
                Enregistrer la note
              </button>
              {noteTarget.resolue ? (
                <button
                  type="button"
                  onClick={() => void toggleResolue(false)}
                  disabled={noteSubmitting}
                  className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
                >
                  Rouvrir
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void toggleResolue(true)}
                  disabled={noteSubmitting}
                  className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
                >
                  {noteSubmitting ? 'Enregistrement…' : 'Marquer résolue'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
