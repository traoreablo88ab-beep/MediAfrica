'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { useToast } from '@/contexts/ToastContext';

interface SubRow {
  id: string;
  organizationId: string;
  organizationName: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
  plan: { id: string; name: string; priceAmount: number; currency: string };
}

interface Plan {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
}

const STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'] as const;

const STATUS_BADGE: Record<string, string> = {
  TRIALING: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  ACTIVE: 'bg-[#0ca30c]/10 text-[#0ca30c]',
  PAST_DUE: 'bg-[#d08a1c]/10 text-[#d08a1c]',
  CANCELED: 'bg-[#d03b3b]/10 text-[#d03b3b]',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
}

export default function AdminSubscriptionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#52514e]">Chargement…</p>}>
      <AdminSubscriptionsContent />
    </Suspense>
  );
}

function AdminSubscriptionsContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('organizationId');

  const [subs, setSubs] = useState<SubRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (organizationId) params.set('organizationId', organizationId);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<{ items: SubRow[]; nextCursor: string | null }>(
        `/api/admin/subscriptions?${params.toString()}`,
      );
      setSubs((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    api<{ items: Plan[] }>('/api/admin/plans')
      .then((res) => setPlans(res.items))
      .catch(() => {});
  }, [statusFilter, organizationId]);

  async function onStatusOverride(sub: SubRow, status: string) {
    if (status === sub.status) return;
    if (
      !window.confirm(`Changer le statut de ${sub.organizationName} : ${sub.status} → ${status} ?`)
    ) {
      return;
    }
    setBusyId(sub.id);
    try {
      await api(`/api/admin/subscriptions/${sub.id}`, { method: 'PATCH', body: { status } });
      setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status } : s)));
      toast('Statut mis à jour.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onPlanOverride(sub: SubRow, planId: string) {
    if (planId === sub.plan.id) return;
    setBusyId(sub.id);
    try {
      await api(`/api/admin/subscriptions/${sub.id}`, { method: 'PATCH', body: { planId } });
      const plan = plans.find((p) => p.id === planId);
      if (plan) {
        setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, plan } : s)));
      }
      toast('Forfait mis à jour.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Souscriptions</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Statut d&apos;abonnement de chaque centre. Le changement manuel est réservé aux cas de
            support (paiement hors plateforme, résiliation…).
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
        >
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {organizationId && (
        <p className="flex items-center gap-1 text-xs text-[#898781]">
          Filtré sur un centre spécifique.{' '}
          <Link href="/admin/subscriptions" className="font-medium text-[#2a78d6] hover:underline">
            Retirer le filtre
          </Link>
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
          {error}
        </p>
      )}

      <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#e1e0d9] bg-[#f9f9f7]/60 text-xs uppercase tracking-wide text-[#898781]">
              <th className="px-5 py-2.5 font-medium">Centre</th>
              <th className="px-5 py-2.5 font-medium">Forfait</th>
              <th className="px-5 py-2.5 font-medium">Statut</th>
              <th className="px-5 py-2.5 font-medium">Fin de période</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((sub) => (
              <tr
                key={sub.id}
                className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
              >
                <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                  <Link
                    href={`/admin/organizations/${sub.organizationId}`}
                    className="hover:text-[#2a78d6] hover:underline"
                  >
                    {sub.organizationName}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <select
                    value={sub.plan.id}
                    disabled={busyId === sub.id}
                    onChange={(e) => onPlanOverride(sub, e.target.value)}
                    className="cursor-pointer rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] transition-colors hover:border-[#2a78d6] focus:border-[#2a78d6] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatAmount(p.priceAmount, p.currency)})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3">
                  <select
                    value={sub.status}
                    disabled={busyId === sub.id}
                    onChange={(e) => onStatusOverride(sub, e.target.value)}
                    className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                      STATUS_BADGE[sub.status] ?? 'bg-[#e1e0d9] text-[#52514e]'
                    }`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3 text-[#898781]">{formatDate(sub.currentPeriodEnd)}</td>
              </tr>
            ))}
            {!loading && subs.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#898781]">
                  Aucune souscription trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cursor && (
        <button
          type="button"
          onClick={() => load(false)}
          disabled={loading}
          className="self-center rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Charger plus'}
        </button>
      )}
    </div>
  );
}
