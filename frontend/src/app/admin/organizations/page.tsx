'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  ownerName: string | null;
  memberCount: number;
  patientCount: number;
  subscription: {
    status: string;
    planName: string;
    planPriceAmount: number;
    currentPeriodEnd: string;
  } | null;
  createdAt: string;
}

interface ListResponse {
  items: OrgRow[];
  nextCursor: string | null;
}

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

const AVATAR_TONES = [
  { bg: 'bg-[#2a78d6]/10', text: 'text-[#2a78d6]' },
  { bg: 'bg-[#0ca30c]/10', text: 'text-[#0ca30c]' },
  { bg: 'bg-[#d08a1c]/10', text: 'text-[#d08a1c]' },
  { bg: 'bg-[#8a5cf6]/10', text: 'text-[#8a5cf6]' },
];

function avatarTone(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('q', q);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<ListResponse>(`/api/admin/organizations?${params.toString()}`);
      setOrgs((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(true);
  }

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Centres de santé</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Chaque centre est un locataire indépendant avec son propre personnel et ses patients.
          </p>
        </div>
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#898781]"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Rechercher un centre…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-md border border-[#e1e0d9] bg-white py-2 pl-9 pr-3 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none sm:w-64"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7]"
          >
            Rechercher
          </button>
        </form>
      </div>

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
              <th className="px-5 py-2.5 font-medium">Propriétaire</th>
              <th className="px-5 py-2.5 font-medium">Personnel</th>
              <th className="px-5 py-2.5 font-medium">Patients</th>
              <th className="px-5 py-2.5 font-medium">Abonnement</th>
              <th className="px-5 py-2.5 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const tone = avatarTone(org.id);
              return (
                <tr
                  key={org.id}
                  className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
                >
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="flex items-center gap-3 hover:text-[#2a78d6]"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}
                      >
                        {initials(org.name)}
                      </span>
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[#52514e]">{org.ownerName ?? org.ownerEmail}</td>
                  <td className="px-5 py-3 text-[#52514e]">{org.memberCount}</td>
                  <td className="px-5 py-3 text-[#52514e]">{org.patientCount}</td>
                  <td className="px-5 py-3">
                    {org.subscription ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[org.subscription.status] ?? 'bg-[#e1e0d9] text-[#52514e]'
                        }`}
                      >
                        {org.subscription.planName} · {org.subscription.status}
                      </span>
                    ) : (
                      <span className="text-xs text-[#898781]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#898781]">{formatDate(org.createdAt)}</td>
                </tr>
              );
            })}
            {!loading && orgs.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#898781]">
                  Aucun centre ne correspond à cette recherche.
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
