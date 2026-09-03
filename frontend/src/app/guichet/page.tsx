'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicName } from '@/lib/useClinicName';

interface TypeRecette {
  id: string;
  libelle: string;
  tarif: number;
  actif: boolean;
}

interface Transaction {
  id: string;
  numeroSequence: number;
  patientNom: string;
  patientId: string | null;
  typeRecetteId: string;
  typeRecetteLibelle: string;
  montant: number;
  modePaiement: 'especes' | 'mobile_money' | 'exoneration';
  guichetierId: string;
  guichetierName: string;
  statut: 'emise' | 'annulee';
  createdAt: string;
  annulationMotif: string | null;
  annulationParId: string | null;
  annulationAt: string | null;
  remiseAppliquee: number | null;
  remiseMotif: string | null;
}

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  exoneration: 'Exonération',
};

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none';

export default function GuichetPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const clinicName = useClinicName();
  const isAdmin = user?.orgRole === 'OWNER' || user?.orgRole === 'ADMIN';

  const [types, setTypes] = useState<TypeRecette[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [patientNom, setPatientNom] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [modePaiement, setModePaiement] = useState<'especes' | 'mobile_money' | 'exoneration'>(
    'especes',
  );
  const [applyRemise, setApplyRemise] = useState(false);
  const [remiseAppliquee, setRemiseAppliquee] = useState('');
  const [remiseMotif, setRemiseMotif] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<Transaction | null>(null);

  const [cancelTarget, setCancelTarget] = useState<Transaction | null>(null);
  const [cancelMotif, setCancelMotif] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [typesRes, txRes] = await Promise.all([
        api<{ types: TypeRecette[] }>('/api/guichet/types-recette'),
        api<{ transactions: Transaction[] }>('/api/guichet/transactions'),
      ]);
      setTypes(typesRes.types.filter((t) => t.actif));
      setTransactions(txRes.transactions);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!selectedTypeId) {
      setFormError('Sélectionnez un type de recette.');
      return;
    }
    if (applyRemise && (!remiseAppliquee || !remiseMotif.trim())) {
      setFormError('Le montant et le motif de la remise sont obligatoires.');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        patientNom: patientNom.trim(),
        typeRecetteId: selectedTypeId,
        modePaiement,
        ...(applyRemise
          ? { remiseAppliquee: Number(remiseAppliquee), remiseMotif: remiseMotif.trim() }
          : {}),
      };
      const created = await api<Transaction>('/api/guichet/transactions', {
        method: 'POST',
        body,
      });
      setLastReceipt(created);
      setTransactions((prev) => [...prev, created]);
      toast(`Reçu n°${created.numeroSequence} émis.`);
      setPatientNom('');
      setSelectedTypeId('');
      setModePaiement('especes');
      setApplyRemise(false);
      setRemiseAppliquee('');
      setRemiseMotif('');
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function openCancel(t: Transaction) {
    setCancelTarget(t);
    setCancelMotif('');
    setCancelError(null);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelMotif.trim().length < 3) {
      setCancelError('Le motif doit contenir au moins 3 caractères.');
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await api<{
        id: string;
        statut: string;
        annulationMotif: string;
        annulationParId: string;
        annulationAt: string;
      }>(`/api/guichet/transactions/${cancelTarget.id}/annuler`, {
        method: 'POST',
        body: { motif: cancelMotif.trim() },
      });
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === updated.id
            ? {
                ...t,
                statut: 'annulee',
                annulationMotif: updated.annulationMotif,
                annulationParId: updated.annulationParId,
                annulationAt: updated.annulationAt,
              }
            : t,
        ),
      );
      toast('Transaction annulée.');
      setCancelTarget(null);
    } catch (err) {
      setCancelError(friendlyError(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="guichet" />
      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Guichet</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/guichet/cloture"
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Clôturer ma caisse
            </Link>
            {isAdmin && (
              <Link
                href="/guichet/tarifs"
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Grille tarifaire
              </Link>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-6 rounded-lg border border-[#e1e0d9] bg-white p-5 lg:col-span-2"
          >
            <h2 className="font-semibold text-[#0b0b0b]">Émettre un reçu</h2>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                Nom du patient *
              </label>
              <input
                className={inputClass}
                placeholder="Ex: Fatoumata Keïta"
                value={patientNom}
                onChange={(e) => setPatientNom(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                Type de recette *
              </label>
              {loading ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : types.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#e1e0d9] px-4 py-6 text-center text-sm text-[#898781]">
                  Aucun tarif actif.{' '}
                  {isAdmin ? (
                    <Link href="/guichet/tarifs" className="text-[#2a78d6] hover:underline">
                      Configurer la grille tarifaire
                    </Link>
                  ) : (
                    'Contactez le responsable du centre.'
                  )}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTypeId(t.id)}
                      className={`rounded-md border px-3 py-3 text-left text-sm transition-colors ${
                        selectedTypeId === t.id
                          ? 'border-[#2a78d6] bg-[#2a78d6]/10 text-[#2a78d6]'
                          : 'border-[#e1e0d9] bg-white text-[#0b0b0b] hover:bg-[#f9f9f7]'
                      }`}
                    >
                      <span className="block font-medium">{t.libelle}</span>
                      <span className="mt-0.5 block text-xs text-[#898781] [font-variant-numeric:tabular-nums]">
                        {formatFcfa(t.tarif)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                Mode de paiement *
              </label>
              <select
                className={inputClass}
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value as typeof modePaiement)}
              >
                <option value="especes">Espèces</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="exoneration">Exonération</option>
              </select>
            </div>

            {isAdmin && (
              <div className="rounded-md border border-[#e1e0d9] p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={applyRemise}
                    onChange={(e) => setApplyRemise(e.target.checked)}
                  />
                  Appliquer une remise exceptionnelle
                </label>
                {applyRemise && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                        Montant de la remise (FCFA) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={remiseAppliquee}
                        onChange={(e) => setRemiseAppliquee(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                        Motif *
                      </label>
                      <input
                        className={inputClass}
                        placeholder="Ex: Indigent"
                        value={remiseMotif}
                        onChange={(e) => setRemiseMotif(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {formError && (
              <p role="alert" className="text-sm text-[#d03b3b]">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Émission…' : '✓ Émettre le reçu'}
            </button>
          </form>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-3 font-semibold text-[#0b0b0b]">Dernier reçu</h2>
            {lastReceipt ? (
              <div className="rounded-md border border-dashed border-[#e1e0d9] p-4 text-sm">
                <p className="text-center font-semibold text-[#0b0b0b]">{clinicName}</p>
                <p className="mb-3 text-center text-xs text-[#898781]">
                  Reçu n° {lastReceipt.numeroSequence}
                </p>
                <dl className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Patient</dt>
                    <dd className="text-right font-medium text-[#0b0b0b]">
                      {lastReceipt.patientNom}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Type</dt>
                    <dd className="text-right text-[#0b0b0b]">{lastReceipt.typeRecetteLibelle}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Montant</dt>
                    <dd className="text-right font-semibold text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                      {formatFcfa(lastReceipt.montant)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Paiement</dt>
                    <dd className="text-right text-[#0b0b0b]">
                      {MODE_LABELS[lastReceipt.modePaiement]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Date</dt>
                    <dd className="text-right text-[#0b0b0b]">
                      {formatDateLong(lastReceipt.createdAt)} — {formatHeure(lastReceipt.createdAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#898781]">Guichetier</dt>
                    <dd className="text-right text-[#0b0b0b]">{lastReceipt.guichetierName}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-[#e1e0d9] px-4 py-8 text-center text-sm text-[#898781]">
                Aucun reçu émis pour l’instant.
              </p>
            )}
          </div>
        </div>

        <h2 className="mb-3 mt-8 font-semibold text-[#0b0b0b]">Historique du jour</h2>
        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium">N°</th>
                <th className="px-5 py-2 font-medium">Heure</th>
                <th className="px-5 py-2 font-medium">Patient</th>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">Montant</th>
                <th className="px-5 py-2 font-medium">Paiement</th>
                {isAdmin && <th className="px-5 py-2 font-medium">Guichetier</th>}
                <th className="px-5 py-2 font-medium">Statut</th>
                <th className="px-5 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                transactions.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3" colSpan={isAdmin ? 9 : 8}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 8}
                    className="px-5 py-8 text-center text-sm text-[#898781]"
                  >
                    Aucune transaction aujourd’hui.
                  </td>
                </tr>
              )}
              {transactions.map((t) => {
                const cancelled = t.statut === 'annulee';
                const canCancel = !cancelled && (isAdmin || t.guichetierId === user?.id);
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-[#e1e0d9] last:border-0 hover:bg-[#f9f9f7] ${cancelled ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-3 text-[#898781] [font-variant-numeric:tabular-nums]">
                      {t.numeroSequence}
                    </td>
                    <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                      {formatHeure(t.createdAt)}
                    </td>
                    <td
                      className={`px-5 py-3 font-medium text-[#0b0b0b] ${cancelled ? 'line-through' : ''}`}
                    >
                      {t.patientNom}
                    </td>
                    <td className="px-5 py-3 text-[#52514e]">{t.typeRecetteLibelle}</td>
                    <td className="px-5 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                      {formatFcfa(t.montant)}
                    </td>
                    <td className="px-5 py-3 text-[#52514e]">{MODE_LABELS[t.modePaiement]}</td>
                    {isAdmin && <td className="px-5 py-3 text-[#52514e]">{t.guichetierName}</td>}
                    <td className="px-5 py-3">
                      {cancelled ? (
                        <span
                          title={t.annulationMotif ?? ''}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-xs font-medium text-[#d03b3b]"
                        >
                          Annulée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0ca30c]/10 px-2 py-0.5 text-xs font-medium text-[#0ca30c]">
                          Émise
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => openCancel(t)}
                          className="text-xs font-medium text-[#d03b3b] hover:underline"
                        >
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="mb-1 font-semibold text-[#0b0b0b]">
              Annuler la transaction n° {cancelTarget.numeroSequence}
            </h3>
            <p className="mb-3 text-sm text-[#52514e]">
              {cancelTarget.patientNom} — {formatFcfa(cancelTarget.montant)}
            </p>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Motif *
            </label>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Ex: Erreur de saisie du montant"
              value={cancelMotif}
              onChange={(e) => setCancelMotif(e.target.value)}
            />
            {cancelError && (
              <p role="alert" className="mt-2 text-sm text-[#d03b3b]">
                {cancelError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => void confirmCancel()}
                disabled={cancelling}
                className="rounded-md bg-[#d03b3b] px-4 py-2 text-sm font-medium text-white hover:bg-[#b83232] disabled:opacity-50"
              >
                {cancelling ? 'Annulation…' : 'Confirmer l’annulation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
