'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';

interface Stats {
  organizationCount: number;
  staffCount: number;
  consultationsThisMonth: number;
  mrr: number;
  mrrCurrency: string;
  revenueTrend: { month: string; total: number }[];
  newOrganizations: { id: string; name: string; slug: string; createdAt: string }[];
}

interface OutboxSummary {
  items: { status: string }[];
}

interface EmailQueueSummary {
  items: { status: string }[];
}

interface RateLimitBucket {
  bucket: string;
  totalKeys: number;
}

type IconProps = { className?: string };

function ClinicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 20V9.5L12 4l8 5.5V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 8.5v3M10.5 10h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RevenueIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 9v0M18 15v0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function StaffCountIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 9.5a2.75 2.75 0 100-5.5M18.5 20c0-2.9-2-5-4.5-5.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConsultationIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 5.5h15a1 1 0 011 1V15a1 1 0 01-1 1H9.5L5 20v-4H4.5a1 1 0 01-1-1V6.5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 9.5h9M7.5 12.5h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertTriangleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 4.5l9 15.5H3l9-15.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BuildingSmallIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 8h1.5M8 12h1.5M8 16h1.5M14.5 8H16M14.5 12H16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface Kpi {
  label: string;
  value: string;
  icon: ComponentType<IconProps>;
  accent: string;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
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

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failedOutbox, setFailedOutbox] = useState<number | null>(null);
  const [deadOutbox, setDeadOutbox] = useState<number | null>(null);
  const [failedEmails, setFailedEmails] = useState<number | null>(null);
  const [deadEmails, setDeadEmails] = useState<number | null>(null);
  const [rateLimits, setRateLimits] = useState<RateLimitBucket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await api<Stats>('/api/admin/stats');
        setStats(s);
      } catch (err) {
        setError(friendlyError(err));
      }
      try {
        const [failed, dead] = await Promise.all([
          api<OutboxSummary>('/api/admin/outbox?status=FAILED&limit=1'),
          api<OutboxSummary>('/api/admin/outbox?status=DEAD&limit=1'),
        ]);
        setFailedOutbox(failed.items.length);
        setDeadOutbox(dead.items.length);
      } catch {
        // Non-critical widget — leave counts blank on failure.
      }
      try {
        const [failedMail, deadMail] = await Promise.all([
          api<EmailQueueSummary>('/api/admin/email-queue?status=FAILED&limit=1'),
          api<EmailQueueSummary>('/api/admin/email-queue?status=DEAD&limit=1'),
        ]);
        setFailedEmails(failedMail.items.length);
        setDeadEmails(deadMail.items.length);
      } catch {
        // Non-critical widget — leave counts blank on failure.
      }
      try {
        const rl = await api<{ buckets: RateLimitBucket[]; note?: string }>(
          '/api/admin/rate-limits',
        );
        setRateLimits(rl.buckets);
      } catch {
        // Non-critical widget.
      }
    })();
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
        {error}
      </p>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-16 w-72 max-w-full animate-pulse rounded-xl bg-[#e1e0d9]/50" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[#e1e0d9]/50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-[#e1e0d9]/50" />
      </div>
    );
  }

  const maxTrend = Math.max(1, ...stats.revenueTrend.map((t) => t.total));
  const totalTrend = stats.revenueTrend.reduce((sum, t) => sum + t.total, 0);
  const systemHealthy =
    (failedOutbox ?? 0) === 0 &&
    (deadOutbox ?? 0) === 0 &&
    (failedEmails ?? 0) === 0 &&
    (deadEmails ?? 0) === 0;
  const activeRateLimitBuckets = rateLimits.filter((b) => b.totalKeys > 0);

  const kpis: Kpi[] = [
    {
      label: 'Centres de santé',
      value: String(stats.organizationCount),
      icon: ClinicIcon,
      accent: '#2a78d6',
    },
    {
      label: 'MRR (revenu mensuel récurrent)',
      value: formatAmount(stats.mrr, stats.mrrCurrency),
      icon: RevenueIcon,
      accent: '#0ca30c',
    },
    {
      label: 'Personnel (tous centres)',
      value: String(stats.staffCount),
      icon: StaffCountIcon,
      accent: '#8a5cf6',
    },
    {
      label: 'Consultations ce mois-ci',
      value: String(stats.consultationsThisMonth),
      icon: ConsultationIcon,
      accent: '#d08a1c',
    },
  ];

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0b0b0b]">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-[#52514e]">
          Indicateurs en direct de la plateforme MediAfrica.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="group rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-shadow duration-200 hover:shadow-[0_8px_20px_-8px_rgba(11,11,11,0.12)]"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
                {kpi.label}
              </p>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${kpi.accent}1a`, color: kpi.accent }}
              >
                <kpi.icon className="h-[18px] w-[18px]" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-[#0b0b0b]">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#0b0b0b]">
              Revenu encaissé (6 derniers mois)
            </h2>
            <span className="text-xs text-[#898781]">
              Total :{' '}
              <span className="font-semibold text-[#0b0b0b]">
                {formatAmount(totalTrend, stats.mrrCurrency)}
              </span>
            </span>
          </div>

          <div className="relative mt-6" style={{ height: 160 }}>
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-px w-full bg-[#e1e0d9]/70" />
              ))}
            </div>
            <div className="relative flex h-full items-end gap-3">
              {stats.revenueTrend.map((t) => {
                const heightPct = Math.max(3, (t.total / maxTrend) * 100);
                return (
                  <div
                    key={t.month}
                    className="group/bar flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <span className="text-[11px] font-medium text-[#0b0b0b] opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
                      {formatAmount(t.total, stats.mrrCurrency)}
                    </span>
                    <div
                      className="w-full rounded-t-md transition-[height,opacity] duration-300"
                      style={{
                        height: `${heightPct}%`,
                        background: 'linear-gradient(180deg, #2a78d6 0%, #2a78d6cc 100%)',
                        opacity: t.total > 0 ? 1 : 0.25,
                      }}
                      title={formatAmount(t.total, stats.mrrCurrency)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex gap-3 border-t border-[#e1e0d9] pt-2">
            {stats.revenueTrend.map((t) => (
              <span key={t.month} className="flex-1 text-center text-xs text-[#898781]">
                {formatMonth(t.month)}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0b0b0b]">État du système</h2>
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                systemHealthy ? 'bg-[#0ca30c]/10 text-[#0ca30c]' : 'bg-[#d03b3b]/10 text-[#d03b3b]'
              }`}
            >
              {systemHealthy ? (
                <CheckCircleIcon className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangleIcon className="h-3.5 w-3.5" />
              )}
              {systemHealthy ? 'Sain' : 'Attention'}
            </span>
          </div>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-[#52514e]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${(failedOutbox ?? 0) > 0 ? 'bg-[#d03b3b]' : 'bg-[#0ca30c]'}`}
                />
                Événements en échec
              </dt>
              <dd
                className={`font-semibold ${(failedOutbox ?? 0) > 0 ? 'text-[#d03b3b]' : 'text-[#0b0b0b]'}`}
              >
                {failedOutbox ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-[#52514e]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${(deadOutbox ?? 0) > 0 ? 'bg-[#d03b3b]' : 'bg-[#0ca30c]'}`}
                />
                Événements morts (DEAD)
              </dt>
              <dd
                className={`font-semibold ${(deadOutbox ?? 0) > 0 ? 'text-[#d03b3b]' : 'text-[#0b0b0b]'}`}
              >
                {deadOutbox ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-[#52514e]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${(failedEmails ?? 0) > 0 ? 'bg-[#d03b3b]' : 'bg-[#0ca30c]'}`}
                />
                Emails en échec
              </dt>
              <dd
                className={`font-semibold ${(failedEmails ?? 0) > 0 ? 'text-[#d03b3b]' : 'text-[#0b0b0b]'}`}
              >
                {failedEmails ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-[#52514e]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${(deadEmails ?? 0) > 0 ? 'bg-[#d03b3b]' : 'bg-[#0ca30c]'}`}
                />
                Emails morts (DEAD)
              </dt>
              <dd
                className={`font-semibold ${(deadEmails ?? 0) > 0 ? 'text-[#d03b3b]' : 'text-[#0b0b0b]'}`}
              >
                {deadEmails ?? '—'}
              </dd>
            </div>
            {activeRateLimitBuckets.slice(0, 4).map((b) => (
              <div key={b.bucket} className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-[#52514e]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d08a1c]" />
                  Limites actives ({b.bucket})
                </dt>
                <dd className="font-semibold text-[#0b0b0b]">{b.totalKeys}</dd>
              </div>
            ))}
            {activeRateLimitBuckets.length === 0 && (
              <p className="text-xs text-[#898781]">Aucune limite de débit active en ce moment.</p>
            )}
          </dl>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
        <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7]/60 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#0b0b0b]">
            <BuildingSmallIcon className="h-4 w-4 text-[#898781]" />
            Nouveaux centres
          </h2>
          <Link
            href="/admin/organizations"
            className="flex items-center gap-1 text-xs font-medium text-[#2a78d6] hover:underline"
          >
            Voir tous les centres
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody>
              {stats.newOrganizations.map((org) => {
                const tone = avatarTone(org.id);
                return (
                  <tr
                    key={org.id}
                    className="border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        className="flex items-center gap-3 font-medium text-[#0b0b0b] hover:text-[#2a78d6]"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone.bg} ${tone.text}`}
                        >
                          {initials(org.name)}
                        </span>
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[#52514e]">{org.slug}</td>
                    <td className="px-5 py-3 text-right text-[#898781]">
                      {formatDate(org.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {stats.newOrganizations.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#898781]">
                    Aucun centre pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
