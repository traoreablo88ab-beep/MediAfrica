'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import {
  ConsultationStatusBadge,
  type ConsultationStatus,
} from '@/components/ConsultationStatusBadge';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';

interface ConsultationRow {
  id: string;
  date: string;
  motif: string;
  status: ConsultationStatus;
  createdAt?: string;
  patient: {
    id: string;
    nom: string;
    prenom: string;
    dossierNumber: string;
    dateNaissance: string;
  };
}

interface ConsultationsPage {
  items: ConsultationRow[];
  nextCursor: string | null;
}

interface PatientRow {
  id: string;
  nom: string;
  prenom: string;
  createdAt: string;
}

interface PatientsPage {
  items: PatientRow[];
  nextCursor: string | null;
}

interface RecentAction {
  key: string;
  name: string;
  detail: string;
  time: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeAge(dateNaissanceIso: string): number {
  const dob = new Date(dateNaissanceIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

async function loadAllConsultationsToday(): Promise<ConsultationRow[]> {
  const all: ConsultationRow[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ date: todayIso(), limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const page = await api<ConsultationsPage>(`/api/consultations?${params.toString()}`);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

async function loadPatientsCreatedToday(): Promise<PatientRow[]> {
  const since = startOfToday();
  const found: PatientRow[] = [];
  let cursor: string | null = null;
  // Patients are ordered createdAt desc, so we can stop as soon as we see
  // one older than today instead of paging through the whole table.
  paging: for (;;) {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const page = await api<PatientsPage>(`/api/patients?${params.toString()}`);
    for (const p of page.items) {
      if (new Date(p.createdAt) < since) break paging;
      found.push(p);
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return found;
}

// Urgent cases surface first — a colored label alone isn't enough priority
// signal in a busy queue; ordering is part of the escalation.
function sortQueue(rows: ConsultationRow[]): ConsultationRow[] {
  return [...rows].sort((a, b) => {
    if (a.status === 'urgent' && b.status !== 'urgent') return -1;
    if (b.status === 'urgent' && a.status !== 'urgent') return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

function buildRecentActions(
  consultations: ConsultationRow[],
  patients: PatientRow[],
): RecentAction[] {
  const fromConsultations: RecentAction[] = consultations.map((c) => ({
    key: `c-${c.id}`,
    name: `${c.patient.nom}, ${c.patient.prenom}`,
    detail: c.status === 'traite' ? 'Consultation clôturée' : 'Consultation enregistrée',
    time: c.createdAt ?? c.date,
  }));
  const fromPatients: RecentAction[] = patients.map((p) => ({
    key: `p-${p.id}`,
    name: `${p.nom}, ${p.prenom}`,
    detail: 'Dossier créé',
    time: p.createdAt,
  }));
  return [...fromConsultations, ...fromPatients]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 6);
}

export default function DashboardPage() {
  const clinicName = useClinicName();
  const [queue, setQueue] = useState<ConsultationRow[]>([]);
  const [newPatients, setNewPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [consultations, patients] = await Promise.all([
          loadAllConsultationsToday(),
          loadPatientsCreatedToday(),
        ]);
        if (!cancelled) {
          setQueue(consultations);
          setNewPatients(patients);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.status === 401
                ? 'Vous devez être connecté pour voir cette page.'
                : err.message
              : 'Erreur inconnue',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const enAttente = queue.filter((c) => c.status === 'attente').length;
  const consultationsTerminees = queue.filter((c) => c.status === 'traite').length;
  const stats: Array<{ label: string; value: number; hero?: boolean }> = [
    { label: 'Consultations aujourd’hui', value: queue.length, hero: true },
    { label: 'En attente', value: enAttente },
    { label: 'Consultations terminées', value: consultationsTerminees },
    { label: 'Nouveaux dossiers', value: newPatients.length },
  ];
  const sortedQueue = sortQueue(queue);
  const recentActions = buildRecentActions(queue, newPatients);

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="dashboard" />

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Tableau de bord</h1>
            <p className="mt-1 text-sm capitalize text-[#52514e]">
              {today} · {clinicName}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/patients"
              className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#898781] transition-colors hover:bg-[#f9f9f7] sm:w-64"
            >
              Rechercher un patient…
            </Link>
            <Link
              href="/patients/new"
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf]"
            >
              + Nouveau patient
            </Link>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={
                stat.hero
                  ? 'rounded-xl bg-[#2a78d6] p-5 text-white shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-shadow duration-300 hover:shadow-md'
                  : 'rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-shadow duration-300 hover:shadow-md'
              }
            >
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  stat.hero ? 'text-white/80' : 'text-[#898781]'
                }`}
              >
                {stat.label}
              </p>
              {loading ? (
                <Skeleton className={`mt-2 h-8 w-16 ${stat.hero ? 'bg-white/20' : ''}`} />
              ) : (
                <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)] lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[#e1e0d9] px-5 py-4">
              <h2 className="font-semibold text-[#0b0b0b]">File du jour</h2>
              <Link href="/patients" className="text-sm font-medium text-[#2a78d6] hover:underline">
                Voir tous les patients →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e1e0d9] text-xs uppercase tracking-wide text-[#898781]">
                    <th className="px-5 py-2 font-medium">N° dossier</th>
                    <th className="px-5 py-2 font-medium">Nom du patient</th>
                    <th className="px-5 py-2 font-medium [font-variant-numeric:tabular-nums]">
                      Âge
                    </th>
                    <th className="px-5 py-2 font-medium">Motif</th>
                    <th className="px-5 py-2 font-medium [font-variant-numeric:tabular-nums]">
                      Heure
                    </th>
                    <th className="px-5 py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-[#e1e0d9] last:border-0">
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-10" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-40" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-12" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </td>
                      </tr>
                    ))}
                  {!loading &&
                    sortedQueue.map((row) => (
                      <tr
                        key={row.id}
                        className={`border-b border-[#e1e0d9] last:border-0 transition-colors hover:bg-[#f9f9f7] ${
                          row.status === 'urgent'
                            ? 'border-l-4 border-l-[#d03b3b] bg-[#d03b3b]/5'
                            : row.status === 'consultation'
                              ? 'bg-[#2a78d6]/5'
                              : ''
                        }`}
                      >
                        <td className="px-5 py-3 text-[#898781]">
                          <Link href={`/patients/${row.patient.id}`} className="hover:underline">
                            {row.patient.dossierNumber}
                          </Link>
                        </td>
                        <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                          <Link href={`/patients/${row.patient.id}`} className="hover:underline">
                            {row.patient.nom}, {row.patient.prenom}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                          {computeAge(row.patient.dateNaissance)} ans
                        </td>
                        <td className="px-5 py-3 text-[#52514e]">{row.motif}</td>
                        <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                          {formatHeure(row.date)}
                        </td>
                        <td className="px-5 py-3">
                          <ConsultationStatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                  {!loading && sortedQueue.length === 0 && !error && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#898781]">
                        Aucune consultation aujourd’hui.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <div className="border-b border-[#e1e0d9] px-5 py-4">
                <h2 className="font-semibold text-[#0b0b0b]">Actions récentes</h2>
              </div>
              <ul>
                {recentActions.map((action) => (
                  <li
                    key={action.key}
                    className="flex items-center justify-between border-b border-[#e1e0d9] px-5 py-3 transition-colors last:border-0 hover:bg-[#f9f9f7]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#0b0b0b]">{action.name}</p>
                      <p className="text-xs text-[#898781]">{action.detail}</p>
                    </div>
                    <span className="text-xs text-[#898781] [font-variant-numeric:tabular-nums]">
                      {formatHeure(action.time)}
                    </span>
                  </li>
                ))}
                {!loading && recentActions.length === 0 && (
                  <li className="px-5 py-4 text-sm text-[#898781]">Aucune activité aujourd’hui.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
