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

interface Transaction {
  id: string;
  guichetierId: string;
  montant: number;
  modePaiement: 'especes' | 'mobile_money' | 'exoneration';
  statut: 'emise' | 'annulee';
}

interface Cloture {
  id: string;
  guichetierId: string;
  guichetierName: string;
  dateService: string;
  recetteTheorique: number;
  recetteRemise: number;
  ecart: number;
  createdAt: string;
}

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  exoneration: 'Exonération',
};

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none';

export default function ClotureCaissePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const clinicName = useClinicName();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [existingCloture, setExistingCloture] = useState<Cloture | null>(null);

  const [recetteRemise, setRecetteRemise] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Cloture | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, clotureRes] = await Promise.all([
        api<{ transactions: Transaction[] }>('/api/guichet/transactions'),
        api<{ clotures: Cloture[] }>('/api/guichet/cloture'),
      ]);
      setTransactions(txRes.transactions);
      const mine = clotureRes.clotures.find((c) => c.guichetierId === user?.id) ?? null;
      setExistingCloture(mine);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recap is always scoped to the caller's own shift regardless of role —
  // an ADMIN/OWNER sees every guichetier's transactions on /guichet for
  // oversight, but their own clôture only ever accounts for their own.
  const mine = transactions.filter((t) => t.guichetierId === user?.id && t.statut === 'emise');
  const recetteTheorique = mine.reduce((sum, t) => sum + t.montant, 0);
  const byMode: Record<string, number> = { especes: 0, mobile_money: 0, exoneration: 0 };
  for (const t of mine) byMode[t.modePaiement] = (byMode[t.modePaiement] ?? 0) + t.montant;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (recetteRemise === '') {
      setFormError('Saisissez le montant compté.');
      return;
    }
    setSubmitting(true);
    try {
      const cloture = await api<Cloture>('/api/guichet/cloture', {
        method: 'POST',
        body: { recetteRemise: Number(recetteRemise) },
      });
      setResult({ ...cloture, guichetierId: user?.id ?? '', guichetierName: user?.name ?? '' });
      toast('Caisse clôturée.');
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const closed = existingCloture ?? result;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="guichet" />
      <div className="animate-fade-in-up mx-auto max-w-3xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/guichet" className="hover:underline">
            Guichet
          </Link>{' '}
          / Clôture de caisse
        </p>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Clôture de caisse</h1>
          <p className="mt-1 text-sm text-[#52514e]">{clinicName} — journée en cours</p>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[#e1e0d9] bg-white p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : closed ? (
          <div className="rounded-lg border border-[#0ca30c]/30 bg-[#0ca30c]/5 p-5">
            <h2 className="mb-3 font-semibold text-[#0ca30c]">Caisse déjà clôturée aujourd’hui</h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#52514e]">Recette théorique</dt>
                <dd className="font-medium text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                  {formatFcfa(closed.recetteTheorique)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#52514e]">Montant compté</dt>
                <dd className="font-medium text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                  {formatFcfa(closed.recetteRemise)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#52514e]">Écart</dt>
                <dd
                  className={`font-semibold [font-variant-numeric:tabular-nums] ${
                    closed.ecart === 0
                      ? 'text-[#0ca30c]'
                      : closed.ecart < 0
                        ? 'text-[#d03b3b]'
                        : 'text-[#d08a1c]'
                  }`}
                >
                  {closed.ecart > 0 ? '+' : ''}
                  {formatFcfa(closed.ecart)}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-3 font-semibold text-[#0b0b0b]">Récapitulatif automatique</h2>
              <p className="mb-3 text-sm text-[#52514e]">
                {mine.length} transaction{mine.length !== 1 ? 's' : ''} émise
                {mine.length !== 1 ? 's' : ''} aujourd’hui.
              </p>
              <dl className="flex flex-col gap-1.5 text-sm">
                {(['especes', 'mobile_money', 'exoneration'] as const).map((mode) => (
                  <div key={mode} className="flex justify-between gap-3">
                    <dt className="text-[#898781]">{MODE_LABELS[mode]}</dt>
                    <dd className="text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                      {formatFcfa(byMode[mode] ?? 0)}
                    </dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between gap-3 border-t border-[#e1e0d9] pt-1.5">
                  <dt className="font-medium text-[#0b0b0b]">Recette théorique totale</dt>
                  <dd className="font-semibold text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                    {formatFcfa(recetteTheorique)}
                  </dd>
                </div>
              </dl>
            </div>

            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-4 rounded-lg border border-[#e1e0d9] bg-white p-5"
            >
              <h2 className="font-semibold text-[#0b0b0b]">Montant physiquement compté</h2>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
                  Montant compté (FCFA) *
                </label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={recetteRemise}
                  onChange={(e) => setRecetteRemise(e.target.value)}
                  required
                />
              </div>
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
                {submitting ? 'Clôture…' : 'Clôturer la caisse'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
