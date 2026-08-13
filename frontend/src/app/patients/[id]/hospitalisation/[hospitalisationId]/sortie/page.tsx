'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface HospitalisationSummary {
  id: string;
  dateHeureEntree: string;
  motifAdmission: string;
  service: string | null;
  dateHeureSortie: string | null;
}

interface PatientSummary {
  nom: string;
  prenom: string;
  hospitalisations: HospitalisationSummary[];
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#898781]">
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayLocalDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function HospitalisationSortiePage() {
  const params = useParams<{ id: string; hospitalisationId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [admission, setAdmission] = useState<HospitalisationSummary | null>(null);

  const [dateHeureSortie, setDateHeureSortie] = useState(todayLocalDate());
  const [issue, setIssue] = useState('');
  const [causeDeces, setCauseDeces] = useState('');
  const [structureReference, setStructureReference] = useState('');
  const [traitementRecu, setTraitementRecu] = useState('');
  const [observations, setObservations] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PatientSummary>(`/api/patients/${params.id}`)
      .then((p) => {
        if (cancelled) return;
        setPatientName(`${p.nom}, ${p.prenom}`);
        const found = p.hospitalisations.find((h) => h.id === params.hospitalisationId) ?? null;
        setAdmission(found);
        if (!found) {
          setLoadError('Admission introuvable.');
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(friendlyError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, params.hospitalisationId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = {
      dateHeureSortie: new Date(dateHeureSortie).toISOString(),
      ...(issue ? { issue } : {}),
      ...(issue === 'Décédé' && causeDeces ? { causeDeces } : {}),
      ...(issue === 'Référé vers autre structure' && structureReference
        ? { structureReference }
        : {}),
      ...(traitementRecu ? { traitementRecu } : {}),
      ...(observations ? { observations } : {}),
    };

    try {
      await api(`/api/hospitalisations/${params.hospitalisationId}`, {
        method: 'PATCH',
        body,
      });
      toast('Sortie enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre d’hospitalisation du mois d’admission est déjà clôturé — impossible d’enregistrer la sortie.'
          : friendlyError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="registres" />
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  if (loadError || !admission) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="registres" />
        <div className="flex min-h-[calc(100vh-61px)] items-center justify-center px-6">
          <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            {loadError ?? 'Admission introuvable.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="registres" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/patients" className="hover:underline">
            Patients
          </Link>{' '}
          /{' '}
          <Link href={`/patients/${params.id}`} className="hover:underline">
            {patientName ?? 'Fiche patient'}
          </Link>{' '}
          / Enregistrer la sortie
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Enregistrer la sortie</h1>
            <p className="mt-1 text-sm text-[#52514e]">
              Admis le {formatDateTime(admission.dateHeureEntree)} — {admission.motifAdmission}
              {admission.service ? ` (${admission.service})` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="hospitalisation-sortie-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer la sortie'}
            </button>
          </div>
        </div>

        {admission.dateHeureSortie && (
          <p className="mb-4 rounded-md bg-[#d08a1c]/10 px-4 py-3 text-sm text-[#d08a1c]">
            Une sortie a déjà été enregistrée le {formatDateTime(admission.dateHeureSortie)} —
            l&apos;enregistrer à nouveau remplacera ces informations.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <form id="hospitalisation-sortie-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Sortie</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Date et heure de sortie" required>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={dateHeureSortie}
                  onChange={(e) => setDateHeureSortie(e.target.value)}
                  required
                />
              </Field>
              <Field label="Issue" required>
                <select
                  className={inputClass}
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  required
                >
                  <option value="">Sélectionner</option>
                  <option value="Sortie médicale">Sortie médicale</option>
                  <option value="Référé vers autre structure">Référé vers autre structure</option>
                  <option value="Décédé">Décédé</option>
                  <option value="Transféré vers autre service">Transféré vers autre service</option>
                  <option value="Abandon">Abandon</option>
                </select>
              </Field>
              {issue === 'Décédé' && (
                <div className="sm:col-span-2">
                  <Field label="Cause du décès">
                    <input
                      className={inputClass}
                      value={causeDeces}
                      onChange={(e) => setCauseDeces(e.target.value)}
                    />
                  </Field>
                </div>
              )}
              {issue === 'Référé vers autre structure' && (
                <div className="sm:col-span-2">
                  <Field label="Structure de référence">
                    <input
                      className={inputClass}
                      value={structureReference}
                      onChange={(e) => setStructureReference(e.target.value)}
                    />
                  </Field>
                </div>
              )}
              <div className="sm:col-span-2">
                <Field label="Traitement reçu (complément)">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={traitementRecu}
                    onChange={(e) => setTraitementRecu(e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Observations">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
