'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import {
  ConsultationStatusBadge,
  CONSULTATION_STATUS_CONFIG,
  type ConsultationStatus,
} from '@/components/ConsultationStatusBadge';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';

interface PatientRow {
  id: string;
  dossierNumber: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: string;
  telephonePrincipal: string;
  communeResidence: string;
  latestConsultation: {
    id: string;
    date: string;
    motif: string;
    status: ConsultationStatus;
  } | null;
}

interface PatientsPage {
  items: PatientRow[];
  nextCursor: string | null;
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

export default function PatientsPage() {
  const clinicName = useClinicName();
  const [q, setQ] = useState('');
  const [sexe, setSexe] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<PatientRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (sexe) params.set('sexe', sexe);
      if (status) params.set('status', status);
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const page = await api<PatientsPage>(`/api/patients?${params.toString()}`);
      setItems(reset ? page.items : [...items, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'Vous devez être connecté pour voir cette page.'
            : err.message
          : 'Erreur inconnue',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    load(true);
  }

  async function onStatusChange(
    patientId: string,
    consultationId: string,
    newStatus: ConsultationStatus,
  ) {
    setUpdatingId(patientId);
    const previous = items;
    setItems((rows) =>
      rows.map((r) =>
        r.id === patientId && r.latestConsultation
          ? { ...r, latestConsultation: { ...r.latestConsultation, status: newStatus } }
          : r,
      ),
    );
    try {
      await api(`/api/consultations/${consultationId}`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
    } catch (err) {
      setItems(previous);
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="patients" />
      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Patients</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
          </div>
          <Link
            href="/patients/new"
            className="flex items-center gap-2 whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf]"
          >
            + Nouveau patient
          </Link>
        </div>

        <form onSubmit={onSubmit} className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom, numéro de dossier ou téléphone…"
            className="flex-1 rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none"
          />
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
          <select
            value={sexe}
            onChange={(e) => setSexe(e.target.value)}
            className="rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
          >
            <option value="">Sexe (tous)</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
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
                <th className="px-5 py-2 font-medium">N° dossier</th>
                <th className="px-5 py-2 font-medium">Nom du patient</th>
                <th className="px-5 py-2 font-medium [font-variant-numeric:tabular-nums]">Âge</th>
                <th className="px-5 py-2 font-medium">Motif</th>
                <th className="px-5 py-2 font-medium [font-variant-numeric:tabular-nums]">Heure</th>
                <th className="px-5 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                items.length === 0 &&
                Array.from({ length: 6 }).map((_, i) => (
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
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-5 py-3 text-[#898781]">
                    <Link href={`/patients/${p.id}`} className="hover:underline">
                      {p.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium text-[#0b0b0b]">
                    <Link href={`/patients/${p.id}`} className="hover:underline">
                      {p.nom}, {p.prenom}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                    {computeAge(p.dateNaissance)} ans
                  </td>
                  <td className="px-5 py-3 text-[#52514e]">{p.latestConsultation?.motif ?? '—'}</td>
                  <td className="px-5 py-3 text-[#52514e] [font-variant-numeric:tabular-nums]">
                    {p.latestConsultation ? formatHeure(p.latestConsultation.date) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {p.latestConsultation ? (
                      <div className="flex items-center gap-2">
                        <ConsultationStatusBadge status={p.latestConsultation.status} />
                        <select
                          aria-label={`Changer le statut de ${p.nom} ${p.prenom}`}
                          value={p.latestConsultation.status}
                          disabled={updatingId === p.id}
                          onChange={(e) =>
                            p.latestConsultation &&
                            onStatusChange(
                              p.id,
                              p.latestConsultation.id,
                              e.target.value as ConsultationStatus,
                            )
                          }
                          className="rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:opacity-50"
                        >
                          {Object.entries(CONSULTATION_STATUS_CONFIG).map(([key, cfg]) => (
                            <option key={key} value={key}>
                              {cfg.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="text-[#898781]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#898781]">
                    Aucun patient trouvé.
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
