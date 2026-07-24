'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface SubscriptionData {
  subscription: {
    id: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string;
  };
  plan: {
    id: string;
    name: string;
    priceAmount: number;
    currency: string;
    billingIntervalDays: number;
  };
  history: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    paymentUrl: string | null;
    paidAt: string | null;
    createdAt: string;
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Période d’essai',
  ACTIVE: 'Actif',
  PAST_DUE: 'Paiement en retard',
  CANCELED: 'Résilié',
};

const STATUS_BADGE: Record<string, string> = {
  TRIALING: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  ACTIVE: 'bg-[#0ca30c]/10 text-[#0ca30c]',
  PAST_DUE: 'bg-[#d08a1c]/10 text-[#d08a1c]',
  CANCELED: 'bg-[#d03b3b]/10 text-[#d03b3b]',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  PAID: 'Payé',
  FAILED: 'Échoué',
  EXPIRED: 'Expiré',
  REFUNDED: 'Remboursé',
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

const ORDER_STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-[#d08a1c]',
  PAID: 'bg-[#0ca30c]',
  FAILED: 'bg-[#d03b3b]',
  EXPIRED: 'bg-[#c9c8c1]',
  REFUNDED: 'bg-[#2a78d6]',
};

export default function FacturationPage() {
  return (
    <Suspense fallback={null}>
      <FacturationContent />
    </Suspense>
  );
}

function FacturationContent() {
  const user = useUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  async function load() {
    try {
      const res = await api<SubscriptionData>('/api/billing/subscription');
      setData(res);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  useEffect(() => {
    void load();
    if (searchParams.get('paid') === '1') {
      toast('Paiement en cours de confirmation — la page se mettra à jour automatiquement.');
    } else if (searchParams.get('failed') === '1') {
      toast('Le paiement a échoué ou a été annulé.', 'error');
    }
  }, []);

  async function onPay() {
    setPaying(true);
    try {
      const res = await api<{ id: string; paymentUrl: string | null; status: string }>(
        '/api/billing/pay',
        { method: 'POST', body: {} },
      );
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        toast('Paiement initié. Actualisez la page dans quelques instants.');
        await load();
      }
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setPaying(false);
    }
  }

  if (!user) return null;

  const canPay = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader />
      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold text-[#0b0b0b]">Facturation</h1>
        <p className="mt-1 text-sm text-[#52514e]">
          Abonnement de votre centre de santé et historique des paiements.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        {!error && !data && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="overflow-hidden rounded-2xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <div className="h-2 w-full bg-[#e1e0d9]/60" />
              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-7 w-40" />
                    <Skeleton className="mt-2 h-4 w-32" />
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-[#f9f9f7] p-4 sm:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="mt-2 h-4 w-24" />
                    </div>
                  ))}
                </div>
                <Skeleton className="mt-5 h-10 w-full rounded-md" />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <div className="border-b border-[#e1e0d9] bg-[#f9f9f7]/60 px-5 py-3">
                <Skeleton className="h-4 w-40" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-[#e1e0d9] px-5 py-3 last:border-0"
                >
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="relative mt-6 overflow-hidden rounded-2xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <div className="h-2 w-full bg-gradient-to-r from-[#2a78d6] to-[#2a78d6]/60" />
              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
                      Forfait actuel
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#0b0b0b]">{data.plan.name}</p>
                    <p className="mt-1 flex items-baseline gap-1 text-sm text-[#52514e]">
                      <span className="text-lg font-semibold text-[#0b0b0b]">
                        {formatAmount(data.plan.priceAmount, data.plan.currency)}
                      </span>
                      / {data.plan.billingIntervalDays} jours
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                      STATUS_BADGE[data.subscription.status] ?? 'bg-[#e1e0d9] text-[#52514e]'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {STATUS_LABEL[data.subscription.status] ?? data.subscription.status}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-[#f9f9f7] p-4 text-sm sm:grid-cols-2">
                  {data.subscription.trialEndsAt && (
                    <div>
                      <dt className="text-xs text-[#898781]">Fin de la période d’essai</dt>
                      <dd className="mt-0.5 font-semibold text-[#0b0b0b]">
                        {formatDate(data.subscription.trialEndsAt)}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-[#898781]">Prochaine échéance</dt>
                    <dd className="mt-0.5 font-semibold text-[#0b0b0b]">
                      {formatDate(data.subscription.currentPeriodEnd)}
                    </dd>
                  </div>
                </dl>

                {canPay ? (
                  <button
                    type="button"
                    onClick={onPay}
                    disabled={paying}
                    className="mt-5 flex items-center justify-center gap-2 rounded-md bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#256abf] disabled:opacity-50"
                  >
                    {paying ? (
                      'Redirection…'
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                          <rect
                            x="2.5"
                            y="6"
                            width="19"
                            height="12"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                        Payer maintenant
                      </>
                    )}
                  </button>
                ) : (
                  <p className="mt-5 text-xs text-[#898781]">
                    Seul le propriétaire ou un administrateur du centre peut effectuer un paiement.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <div className="border-b border-[#e1e0d9] bg-[#f9f9f7]/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-[#0b0b0b]">Historique des paiements</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {data.history.map((h) => (
                      <tr
                        key={h.id}
                        className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
                      >
                        <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                          {formatAmount(h.amount, h.currency)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[#52514e]">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${ORDER_STATUS_DOT[h.status] ?? 'bg-[#c9c8c1]'}`}
                            />
                            {ORDER_STATUS_LABEL[h.status] ?? h.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[#898781]">{formatDate(h.createdAt)}</td>
                      </tr>
                    ))}
                    {data.history.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#898781]">
                          Aucun paiement pour le moment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
