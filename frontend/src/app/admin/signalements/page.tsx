'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { useToast } from '@/contexts/ToastContext';

interface ReportRow {
  id: string;
  organizationId: string;
  organizationName: string;
  reporterEmail: string;
  reporterName: string | null;
  category: string;
  message: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Bug',
  support: 'Support',
  billing: 'Facturation',
  autre: 'Autre',
};

const CATEGORY_BADGE: Record<string, string> = {
  bug: 'bg-[#d03b3b]/10 text-[#d03b3b]',
  support: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  billing: 'bg-[#d08a1c]/10 text-[#d08a1c]',
  autre: 'bg-[#e1e0d9] text-[#52514e]',
};

const CATEGORY_ACCENT: Record<string, string> = {
  bug: '#d03b3b',
  support: '#2a78d6',
  billing: '#d08a1c',
  autre: '#c9c8c1',
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

export default function AdminSignalementsPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('OPEN');
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
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<{ items: ReportRow[]; nextCursor: string | null }>(
        `/api/admin/reports?${params.toString()}`,
      );
      setReports((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, [statusFilter]);

  async function onResolve(report: ReportRow) {
    setBusyId(report.id);
    try {
      await api(`/api/admin/reports/${report.id}`, {
        method: 'PATCH',
        body: { status: 'RESOLVED' },
      });
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      toast('Signalement résolu.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onReopen(report: ReportRow) {
    setBusyId(report.id);
    try {
      await api(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: { status: 'OPEN' } });
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: 'OPEN' } : r)));
      toast('Signalement rouvert.');
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
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Signalements</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Bugs, demandes de support et problèmes de facturation remontés par le personnel des
            centres.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="cursor-pointer rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] transition-colors hover:border-[#2a78d6] focus:border-[#2a78d6] focus:outline-none"
        >
          <option value="OPEN">Ouverts</option>
          <option value="RESOLVED">Résolus</option>
          <option value="">Tous</option>
        </select>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {reports.map((r) => (
          <div
            key={r.id}
            className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(11,11,11,0.12)]"
          >
            <div className="flex">
              <div
                className="w-1 shrink-0"
                style={{ background: CATEGORY_ACCENT[r.category] ?? '#c9c8c1' }}
              />
              <div className="flex-1 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        CATEGORY_BADGE[r.category] ?? 'bg-[#e1e0d9] text-[#52514e]'
                      }`}
                    >
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                    <Link
                      href={`/admin/organizations/${r.organizationId}`}
                      className="text-sm font-medium text-[#0b0b0b] hover:text-[#2a78d6] hover:underline"
                    >
                      {r.organizationName}
                    </Link>
                    <span className="text-xs text-[#898781]">
                      {r.reporterName ?? r.reporterEmail}
                    </span>
                  </div>
                  <span className="text-xs text-[#898781]">{formatDate(r.createdAt)}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#52514e]">{r.message}</p>
                <div className="mt-4 flex items-center gap-2">
                  {r.status === 'OPEN' ? (
                    <button
                      type="button"
                      onClick={() => onResolve(r)}
                      disabled={busyId === r.id}
                      className="rounded-md bg-[#0ca30c]/10 px-3 py-1.5 text-xs font-medium text-[#0ca30c] transition-colors hover:bg-[#0ca30c]/20 disabled:opacity-50"
                    >
                      Marquer comme résolu
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onReopen(r)}
                      disabled={busyId === r.id}
                      className="rounded-md border border-[#e1e0d9] px-3 py-1.5 text-xs font-medium text-[#52514e] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50"
                    >
                      Rouvrir
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!loading && reports.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#e1e0d9] bg-white px-5 py-12 text-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-8 w-8 text-[#c9c8c1]"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M8 12.5l2.5 2.5L16 9.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm text-[#898781]">Aucun signalement.</p>
          </div>
        )}
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
