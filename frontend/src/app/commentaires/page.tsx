'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

interface ReportRow {
  id: string;
  reporterEmail: string;
  reporterName: string | null;
  category: string;
  message: string;
  rating: number | null;
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
      className="h-5 w-5"
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

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? null : n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#2a78d6]/40"
        >
          <StarIcon filled={value !== null && n <= value} />
        </button>
      ))}
      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-xs text-[#898781] hover:text-[#52514e]"
        >
          Effacer
        </button>
      )}
    </div>
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

export default function CommentairesPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<keyof typeof CATEGORY_LABEL>('general');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await api<{ items: ReportRow[]; nextCursor: string | null }>(
        `/api/reports?${params.toString()}`,
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
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await api('/api/reports', {
        method: 'POST',
        body: { category, message, ...(rating !== null ? { rating } : {}) },
      });
      setMessage('');
      setRating(null);
      setCategory('general');
      toast('Commentaire envoyé — merci pour votre retour !');
      await load(true);
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="commentaires" />
      <div className="animate-fade-in-up mx-auto max-w-3xl px-6 py-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0b0b0b]">Commentaires</h1>
          <p className="mt-1 text-sm text-[#52514e]">
            Votre avis sur l&rsquo;application MediAfrica — ce qui fonctionne bien, ce qui pourrait
            être amélioré. Visible par votre centre et lu par l&rsquo;équipe MediAfrica.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-6 flex flex-col gap-4 rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
        >
          <div>
            <label className="text-xs font-medium text-[#52514e]">
              Votre satisfaction (optionnel)
            </label>
            <div className="mt-1.5">
              <StarRating value={rating} onChange={setRating} />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:w-52">
              <label className="text-xs font-medium text-[#52514e]">Concerne</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="mt-1 w-full cursor-pointer rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-[#52514e]">Votre commentaire</label>
              <textarea
                required
                rows={3}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Qu'est-ce qui fonctionne bien ? Qu'est-ce qu'on pourrait améliorer ?"
                className="mt-1 w-full resize-none rounded-md border border-[#e1e0d9] px-3 py-2 text-sm focus:border-[#2a78d6] focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="self-end rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a78d6]/90 disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
            >
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
                  <span className="text-xs text-[#898781]">
                    {r.reporterName ?? r.reporterEmail}
                  </span>
                </div>
                <span className="text-xs text-[#898781]">{formatDate(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#52514e]">{r.message}</p>
              {r.adminResponse && (
                <div className="mt-3 rounded-lg bg-[#2a78d6]/5 px-3 py-2.5">
                  <p className="text-xs font-medium text-[#2a78d6]">
                    Réponse de l&rsquo;équipe MediAfrica
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#0b0b0b]">{r.adminResponse}</p>
                </div>
              )}
            </div>
          ))}
          {!loading && reports.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#e1e0d9] bg-white px-5 py-12 text-center">
              <p className="text-sm text-[#898781]">Aucun commentaire pour le moment.</p>
            </div>
          )}
        </div>

        {cursor && (
          <button
            type="button"
            onClick={() => load(false)}
            disabled={loading}
            className="mt-4 self-center rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50"
          >
            {loading ? 'Chargement…' : 'Charger plus'}
          </button>
        )}
      </div>
    </main>
  );
}
