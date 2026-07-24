'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';

interface OrgDetail {
  id: string;
  slug: string;
  name: string;
  owner: { id: string; email: string; name: string | null };
  patientCount: number;
  createdAt: string;
  members: { id: string; email: string; name: string | null; role: string }[];
  subscription: {
    id: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string;
    plan: { id: string; name: string; priceAmount: number; currency: string };
  } | null;
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-[#2a78d6] text-white',
  ADMIN: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  MEMBER: 'bg-[#e1e0d9] text-[#52514e]',
};

const SUBSCRIPTION_STATUS_BADGE: Record<string, string> = {
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgDetail>(`/api/admin/organizations/${params.id}`)
      .then(setOrg)
      .catch((err) => setError(friendlyError(err)));
  }, [params.id]);

  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
        {error}
      </p>
    );
  }

  if (!org) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-16 w-72 animate-pulse rounded-xl bg-[#e1e0d9]/50" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[#e1e0d9]/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div>
        <Link
          href="/admin/organizations"
          className="flex items-center gap-1 text-xs font-medium text-[#2a78d6] hover:underline"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Tous les centres
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#2a78d6]/10 text-lg font-bold text-[#2a78d6]">
            {initials(org.name)}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">{org.name}</h1>
            <p className="mt-0.5 text-sm text-[#52514e]">
              {org.slug} · créé le {formatDate(org.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">Propriétaire</p>
          <p className="mt-2 text-sm font-semibold text-[#0b0b0b]">
            {org.owner.name ?? org.owner.email}
          </p>
          <p className="text-xs text-[#898781]">{org.owner.email}</p>
        </div>
        <div className="rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">Patients</p>
          <p className="mt-2 text-2xl font-bold text-[#0b0b0b]">{org.patientCount}</p>
        </div>
        <div className="rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">Personnel</p>
          <p className="mt-2 text-2xl font-bold text-[#0b0b0b]">{org.members.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0b0b0b]">Abonnement</h2>
          {org.subscription && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                SUBSCRIPTION_STATUS_BADGE[org.subscription.status] ?? 'bg-[#e1e0d9] text-[#52514e]'
              }`}
            >
              {org.subscription.status}
            </span>
          )}
        </div>
        {org.subscription ? (
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[#898781]">Forfait</dt>
              <dd className="mt-0.5 font-semibold text-[#0b0b0b]">{org.subscription.plan.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#898781]">Prix</dt>
              <dd className="mt-0.5 font-semibold text-[#0b0b0b]">
                {formatAmount(org.subscription.plan.priceAmount, org.subscription.plan.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#898781]">Fin de période</dt>
              <dd className="mt-0.5 font-semibold text-[#0b0b0b]">
                {formatDate(org.subscription.currentPeriodEnd)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[#898781]">Aucun abonnement.</p>
        )}
        <Link
          href={`/admin/subscriptions?organizationId=${org.id}`}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#2a78d6] hover:underline"
        >
          Gérer l&apos;abonnement
          <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
        <div className="border-b border-[#e1e0d9] bg-[#f9f9f7]/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-[#0b0b0b]">Personnel</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2.5 font-medium">Nom</th>
                <th className="px-5 py-2.5 font-medium">Email</th>
                <th className="px-5 py-2.5 font-medium">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
                >
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">{m.name ?? '—'}</td>
                  <td className="px-5 py-3 text-[#52514e]">{m.email}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[m.role] ?? ''}`}
                    >
                      {m.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
