'use client';

import { useEffect, useState, type FormEvent } from 'react';
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
  rating: number | null;
  status: string;
  adminResponse: string | null;
  adminRespondedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  general: 'Avis général',
  patients: 'Patients',
  consultations: 'Consultations',
  registres: 'Registres',
  personnel: 'Personnel',
  facturation: 'Facturation',
  autre: 'Autre',
};

const CATEGORY_BADGE: Record<string, string> = {
  general: 'bg-[#8a5cf6]/10 text-[#8a5cf6]',
  patients: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  consultations: 'bg-[#0ca30c]/10 text-[#0ca30c]',
  registres: 'bg-[#d08a1c]/10 text-[#d08a1c]',
  personnel: 'bg-[#2a78d6]/10 text-[#2a78d6]',
  facturation: 'bg-[#d08a1c]/10 text-[#d08a1c]',
  autre: 'bg-[#e1e0d9] text-[#52514e]',
};

const CATEGORY_ACCENT: Record<string, string> = {
  general: '#8a5cf6',
  patients: '#2a78d6',
  consultations: '#0ca30c',
  registres: '#d08a1c',
  personnel: '#2a78d6',
  facturation: '#d08a1c',
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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={filled ? '#d08a1c' : 'none'}
      stroke={filled ? '#d08a1c' : '#c9c8c1'}
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path
        d="M12 3.5l2.55 5.4 5.95.75-4.36 4.16 1.14 5.94L12 16.9l-5.28 2.85 1.14-5.94-4.36-4.16 5.95-.75L12 3.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Note : ${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= value} />
      ))}
    </span>
  );
}

function ReplyForm({
  report,
  onSubmitted,
}: {
  report: ReportRow;
  onSubmitted: (id: string, response: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/api/admin/reports/${report.id}`, {
        method: 'PATCH',
        body: { adminResponse: text, status: 'RESOLVED' },
      });
      onSubmitted(report.id, text);
      setText('');
      setOpen(false);
      toast('Réponse envoyée.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSending(false);
    }
  }

  if (report.adminResponse) {
    return (
      <div className="mt-3 rounded-lg bg-[#2a78d6]/5 px-3 py-2.5">
        <p className="text-xs font-medium text-[#2a78d6]">Votre réponse</p>
        <p className="mt-1 text-sm leading-relaxed text-[#0b0b0b]">{report.adminResponse}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-[#e1e0d9] px-3 py-1.5 text-xs font-medium text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
      >
        Répondre
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
      <textarea
        autoFocus
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Votre réponse, visible par le centre…"
        className="w-full resize-none rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-md bg-[#2a78d6] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a78d6]/90 disabled:opacity-50"
        >
          {sending ? 'Envoi…' : 'Envoyer la réponse'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-[#898781] hover:text-[#52514e]"
        >
          Annuler
        </button>
      </div>
    </form>
  );
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

  function onReplySubmitted(id: string, response: string) {
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, adminResponse: response, status: 'RESOLVED' } : r)),
    );
    if (statusFilter === 'OPEN') {
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function onReopen(report: ReportRow) {
    setBusyId(report.id);
    try {
      await api(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: { status: 'OPEN' } });
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: 'OPEN' } : r)));
      toast('Rouvert.');
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
            Avis et retours sur l&rsquo;application, laissés par le personnel de chaque centre.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="cursor-pointer rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] transition-colors hover:border-[#2a78d6] focus:border-[#2a78d6] focus:outline-none"
        >
          <option value="OPEN">Sans réponse</option>
          <option value="RESOLVED">Déjà répondus</option>
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
                    {r.rating !== null && <StarDisplay value={r.rating} />}
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
                <ReplyForm report={r} onSubmitted={onReplySubmitted} />
                {r.status === 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => onReopen(r)}
                    disabled={busyId === r.id}
                    className="mt-2 text-xs font-medium text-[#898781] hover:text-[#52514e] disabled:opacity-50"
                  >
                    Rouvrir sans réponse
                  </button>
                )}
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
