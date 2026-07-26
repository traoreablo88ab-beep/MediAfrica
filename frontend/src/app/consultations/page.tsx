'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';
import { DatePicker } from '@/components/DatePicker';
import {
  ConsultationStatusBadge,
  CONSULTATION_STATUS_CONFIG,
  type ConsultationStatus,
} from '@/components/ConsultationStatusBadge';

interface ConsultationRow {
  id: string;
  date: string;
  motif: string;
  status: ConsultationStatus;
  patient: { id: string; nom: string; prenom: string; dossierNumber: string };
  providerName: string | null;
}

interface ConsultationsPage {
  items: ConsultationRow[];
  nextCursor: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ConsultationsPage() {
  const clinicName = useClinicName();
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ConsultationRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const page = await api<ConsultationsPage>(`/api/consultations?${params.toString()}`);
      setItems(reset ? page.items : [...items, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
  }, [date, status]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    load(true);
  }

  async function onStatusChange(id: string, newStatus: ConsultationStatus) {
    setUpdatingId(id);
    const previous = items;
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    try {
      await api(`/api/consultations/${id}`, { method: 'PATCH', body: { status: newStatus } });
    } catch (err) {
      setItems(previous);
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="consultations" />

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Consultations</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
          </div>
          <Link
            href="/patients"
            title="Choisissez d’abord le patient concerné"
            className="flex items-center gap-2 whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf]"
          >
            + Nouvelle consultation
          </Link>
        </div>

        <form
          onSubmit={onSearchSubmit}
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom ou numéro de dossier…"
            className="flex-1 rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none"
          />
          <DatePicker value={date} onChange={setDate} />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
          >
            <option value="">Statut (tous)</option>
            <option value="attente">En attente</option>
            <option value="consultation">En consultation</option>
            <option value="traite">Traité</option>
            <option value="urgent">Urgent</option>
          </select>
          <button
            type="submit"
            className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7]"
          >
            Rechercher
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                <th className="px-5 py-2 font-medium [font-variant-numeric:tabular-nums]">Heure</th>
                <th className="px-5 py-2 font-medium">N° dossier</th>
                <th className="px-5 py-2 font-medium">Patient</th>
                <th className="px-5 py-2 font-medium">Motif</th>
                <th className="px-5 py-2 font-medium">Soignant</th>
                <th className="px-5 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                items.length === 0 &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-12" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-5 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                  </tr>
                ))}
              {items.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7] ${
                    c.status === 'urgent' ? 'border-l-4 border-l-[#d03b3b] bg-[#d03b3b]/5' : ''
                  }`}
                >
                  <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                    {formatHeure(c.date)}
                  </td>
                  <td className="px-5 py-3 text-[#898781]">
                    <Link href={`/patients/${c.patient.id}`} className="hover:underline">
                      {c.patient.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                    <Link href={`/patients/${c.patient.id}`} className="hover:underline">
                      {c.patient.nom}, {c.patient.prenom}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[#52514e]">{c.motif}</td>
                  <td className="px-5 py-3 text-[#52514e]">{c.providerName ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <ConsultationStatusBadge status={c.status} />
                      <select
                        aria-label={`Changer le statut de ${c.patient.nom} ${c.patient.prenom}`}
                        value={c.status}
                        disabled={updatingId === c.id}
                        onChange={(e) => onStatusChange(c.id, e.target.value as ConsultationStatus)}
                        className="rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:opacity-50"
                      >
                        {Object.entries(CONSULTATION_STATUS_CONFIG).map(([key, cfg]) => (
                          <option key={key} value={key}>
                            {cfg.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#898781]">
                    <p>Aucune consultation le {formatDateLong(date)}.</p>
                    <button
                      type="button"
                      onClick={() => setDate(addDays(date, -1))}
                      className="mt-2 font-medium text-[#2a78d6] hover:underline"
                    >
                      ← Voir les jours précédents
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => load(false)}
              disabled={loading}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50"
            >
              {loading ? 'Chargement…' : 'Charger plus'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
