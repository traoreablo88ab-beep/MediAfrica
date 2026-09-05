'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/contexts/AuthContext';

interface ParProduit {
  produitId: string;
  produitNom: string;
  quantite: number;
  montant: number;
}

interface ParGerant {
  gerantId: string;
  gerantName: string;
  montant: number;
  nombreVentes: number;
}

interface Rapport {
  from: string;
  to: string;
  totalVentes: number;
  totalMontant: number;
  parProduit: ParProduit[];
  parGerant: ParGerant[];
}

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none';

export default function DepotRapportsPage() {
  const { user } = useAuth();

  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<Rapport>(`/api/depot/rapports?from=${from}&to=${to}`);
      setRapport(res);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;
  const canManage = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  if (!canManage) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="depot" />
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
      <AppHeader active="depot" />
      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/depot" className="hover:underline">
            Dépôt
          </Link>{' '}
          / Rapports
        </p>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Rapports du dépôt</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Ventes par produit et par gérant sur la période choisie. Seules les ventes émises
            comptent — une vente annulée n’est jamais incluse.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-[#e1e0d9] bg-white p-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Du
            </label>
            <input
              type="date"
              className={inputClass}
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
              Au
            </label>
            <input
              type="date"
              className={inputClass}
              value={to}
              min={from}
              max={todayIso()}
              onChange={(e) => setTo(e.target.value)}
            />
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

        {loading ? (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          rapport && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
                  Chiffre d’affaires
                </p>
                <p className="mt-1 text-2xl font-bold text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                  {formatFcfa(rapport.totalMontant)}
                </p>
              </div>
              <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
                  Ventes émises
                </p>
                <p className="mt-1 text-2xl font-bold text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                  {rapport.totalVentes}
                </p>
              </div>
            </div>
          )
        )}

        <h2 className="mb-3 font-semibold text-[#0b0b0b]">Ventes par produit</h2>
        <div className="mb-8 overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium">Produit</th>
                <th className="px-5 py-2 font-medium">Quantité vendue</th>
                <th className="px-5 py-2 font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3" colSpan={3}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && rapport?.parProduit.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-[#898781]">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              )}
              {rapport?.parProduit.map((p) => (
                <tr key={p.produitId} className="border-b border-[#e1e0d9] last:border-0">
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">{p.produitNom}</td>
                  <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                    {p.quantite}
                  </td>
                  <td className="px-5 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                    {formatFcfa(p.montant)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mb-3 font-semibold text-[#0b0b0b]">Ventes par gérant</h2>
        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium">Gérant</th>
                <th className="px-5 py-2 font-medium">Nombre de ventes</th>
                <th className="px-5 py-2 font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3" colSpan={3}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && rapport?.parGerant.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-[#898781]">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              )}
              {rapport?.parGerant.map((g) => (
                <tr key={g.gerantId} className="border-b border-[#e1e0d9] last:border-0">
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">{g.gerantName}</td>
                  <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                    {g.nombreVentes}
                  </td>
                  <td className="px-5 py-3 text-[#0b0b0b] [font-variant-numeric:tabular-nums]">
                    {formatFcfa(g.montant)}
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
