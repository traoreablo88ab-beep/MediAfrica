'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';

interface OrderRow {
  id: string;
  userId: string;
  organizationId: string | null;
  organization: { name: string } | null;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string;
  provider: string;
  paymentUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'] as const;

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-[#d08a1c]/10 text-[#d08a1c]',
  PAID: 'bg-[#0ca30c]/10 text-[#0ca30c]',
  FAILED: 'bg-[#d03b3b]/10 text-[#d03b3b]',
  EXPIRED: 'bg-[#e1e0d9] text-[#52514e]',
  REFUNDED: 'bg-[#2a78d6]/10 text-[#2a78d6]',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
}

export default function AdminTransactionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#52514e]">Chargement…</p>}>
      <AdminTransactionsContent />
    </Suspense>
  );
}

function AdminTransactionsContent() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('organizationId');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (organizationId) params.set('organizationId', organizationId);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<{ items: OrderRow[]; nextCursor: string | null }>(
        `/api/admin/orders?${params.toString()}`,
      );
      setOrders((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, [statusFilter, organizationId]);

  const paidOrders = orders.filter((o) => o.status === 'PAID');
  const paidTotal = paidOrders.reduce((sum, o) => sum + o.amount, 0);
  const paidCurrency = paidOrders[0]?.currency ?? 'XOF';

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Transactions</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Historique des paiements d&apos;abonnement à travers tous les centres.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="cursor-pointer rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] transition-colors hover:border-[#2a78d6] focus:border-[#2a78d6] focus:outline-none"
        >
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">Affichées</p>
            <p className="mt-1.5 text-xl font-bold text-[#0b0b0b]">{orders.length}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">Payées</p>
            <p className="mt-1.5 text-xl font-bold text-[#0ca30c]">{paidOrders.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Montant encaissé (affiché)
            </p>
            <p className="mt-1.5 text-xl font-bold text-[#0b0b0b]">
              {formatAmount(paidTotal, paidCurrency)}
            </p>
          </div>
        </div>
      )}

      {organizationId && (
        <p className="flex items-center gap-1 text-xs text-[#898781]">
          Filtré sur un centre spécifique.{' '}
          <Link href="/admin/transactions" className="font-medium text-[#2a78d6] hover:underline">
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
              <th className="px-5 py-2.5 font-medium">Montant</th>
              <th className="px-5 py-2.5 font-medium">Statut</th>
              <th className="px-5 py-2.5 font-medium">Email client</th>
              <th className="px-5 py-2.5 font-medium">Fournisseur</th>
              <th className="px-5 py-2.5 font-medium">Créé le</th>
              <th className="px-5 py-2.5 font-medium">Payé le</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr
                key={o.id}
                className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
              >
                <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                  {o.organizationId ? (
                    <Link
                      href={`/admin/organizations/${o.organizationId}`}
                      className="hover:text-[#2a78d6] hover:underline"
                    >
                      {o.organization?.name ?? o.organizationId}
                    </Link>
                  ) : (
                    <span className="text-[#898781]">—</span>
                  )}
                </td>
                <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                  {formatAmount(o.amount, o.currency)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_BADGE[o.status] ?? 'bg-[#e1e0d9] text-[#52514e]'
                    }`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#52514e]">{o.customerEmail}</td>
                <td className="px-5 py-3 text-[#898781]">{o.provider}</td>
                <td className="px-5 py-3 text-[#898781]">{formatDate(o.createdAt)}</td>
                <td className="px-5 py-3 text-[#898781]">
                  {o.paidAt ? formatDate(o.paidAt) : '—'}
                </td>
              </tr>
            ))}
            {!loading && orders.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#898781]">
                  Aucune transaction trouvée.
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
