'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';

interface TypeRecette {
  id: string;
  libelle: string;
  tarif: number;
  actif: boolean;
}

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none';

export default function GrilleTarifairePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [types, setTypes] = useState<TypeRecette[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [libelle, setLibelle] = useState('');
  const [tarif, setTarif] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ types: TypeRecette[] }>('/api/guichet/types-recette');
      setTypes(res.types);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!libelle.trim() || tarif === '') {
      setCreateError('Le libellé et le tarif sont obligatoires.');
      return;
    }
    setCreating(true);
    try {
      const created = await api<TypeRecette>('/api/guichet/types-recette', {
        method: 'POST',
        body: { libelle: libelle.trim(), tarif: Number(tarif) },
      });
      setTypes((prev) => [...prev, created].sort((a, b) => a.libelle.localeCompare(b.libelle)));
      toast('Tarif ajouté.');
      setLibelle('');
      setTarif('');
    } catch (err) {
      setCreateError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggleActif(t: TypeRecette) {
    setBusyId(t.id);
    const previous = types;
    setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, actif: !x.actif } : x)));
    try {
      await api(`/api/guichet/types-recette/${t.id}`, {
        method: 'PATCH',
        body: { actif: !t.actif },
      });
    } catch (err) {
      setTypes(previous);
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onEditTarif(t: TypeRecette) {
    const raw = window.prompt(`Nouveau tarif pour "${t.libelle}" (FCFA) :`, String(t.tarif));
    if (raw === null) return;
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0) {
      toast('Tarif invalide.', 'error');
      return;
    }
    setBusyId(t.id);
    const previous = types;
    setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, tarif: next } : x)));
    try {
      await api(`/api/guichet/types-recette/${t.id}`, { method: 'PATCH', body: { tarif: next } });
      toast('Tarif mis à jour.');
    } catch (err) {
      setTypes(previous);
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;
  const canManage = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  if (!canManage) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="guichet" />
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            Accès réservé au propriétaire ou à un administrateur du centre.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="guichet" />
      <div className="animate-fade-in-up mx-auto max-w-3xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/guichet" className="hover:underline">
            Guichet
          </Link>{' '}
          / Grille tarifaire
        </p>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Grille tarifaire</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Types de recettes proposés au guichet. Désactiver un tarif conserve son historique —
            aucune suppression n’est possible.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <form
          onSubmit={onCreate}
          className="mb-6 flex flex-col gap-3 rounded-lg border border-[#e1e0d9] bg-white p-5 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Libellé
            </label>
            <input
              className={inputClass}
              placeholder="Ex: Consultation générale"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
            />
          </div>
          <div className="sm:w-40">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Tarif (FCFA)
            </label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={tarif}
              onChange={(e) => setTarif(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
          >
            {creating ? 'Ajout…' : '+ Ajouter'}
          </button>
        </form>
        {createError && (
          <p role="alert" className="mb-4 text-sm text-[#d03b3b]">
            {createError}
          </p>
        )}

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium">Libellé</th>
                <th className="px-5 py-2 font-medium">Tarif</th>
                <th className="px-5 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                types.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3" colSpan={4}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && types.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-[#898781]">
                    Aucun tarif configuré.
                  </td>
                </tr>
              )}
              {types.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-[#e1e0d9] last:border-0 hover:bg-[#f9f9f7] ${!t.actif ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">{t.libelle}</td>
                  <td className="px-5 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                    <button
                      type="button"
                      onClick={() => void onEditTarif(t)}
                      disabled={busyId === t.id}
                      className="hover:underline disabled:opacity-50"
                    >
                      {formatFcfa(t.tarif)}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    {t.actif ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0ca30c]/10 px-2 py-0.5 text-xs font-medium text-[#0ca30c]">
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e1e0d9] px-2 py-0.5 text-xs font-medium text-[#898781]">
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => void onToggleActif(t)}
                      disabled={busyId === t.id}
                      className="text-xs font-medium text-[#2a78d6] hover:underline disabled:opacity-50"
                    >
                      {t.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
