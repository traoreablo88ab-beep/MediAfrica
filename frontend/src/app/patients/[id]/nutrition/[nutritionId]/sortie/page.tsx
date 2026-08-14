'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface NutritionSummary {
  id: string;
  date: string;
  type: string;
  dateSortie: string | null;
  typeSortie: string | null;
}

interface PatientSummary {
  nom: string;
  prenom: string;
  nutritions: NutritionSummary[];
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

const TYPE_SORTIE_OPTIONS = [
  'Guéri',
  'Décès',
  'Abandon',
  'Non répondant',
  'Transféré/référé',
  'Perdu de vue',
];

const DESTINATION_PROGRAMME_OPTIONS: Record<'URENI' | 'URENAS' | 'URENAM', string[]> = {
  URENAM: ['URENAS', 'Autre structure'],
  URENAS: ['URENI', 'Autre structure'],
  URENI: ['URENAS', 'URENAM', 'Autre structure'],
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayLocalDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function NutritionSortiePage() {
  const params = useParams<{ id: string; nutritionId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [record, setRecord] = useState<NutritionSummary | null>(null);

  const [dateSortie, setDateSortie] = useState(todayLocalDate());
  const [poidsSortieKg, setPoidsSortieKg] = useState('');
  const [tailleSortieCm, setTailleSortieCm] = useState('');
  const [perimetreBrachialSortieCm, setPerimetreBrachialSortieCm] = useState('');
  const [ptIndiceSortie, setPtIndiceSortie] = useState('');
  const [oedemeSortie, setOedemeSortie] = useState('');
  const [typeSortie, setTypeSortie] = useState('');
  const [destinationProgramme, setDestinationProgramme] = useState('');
  const [datePoidsMinimum, setDatePoidsMinimum] = useState('');
  const [poidsMinimumKg, setPoidsMinimumKg] = useState('');
  const [seancesStimulationPsychocognitive, setSeancesStimulationPsychocognitive] = useState('');
  const [seancesCcsc, setSeancesCcsc] = useState('');
  const [beneficiairePoudreNutritive, setBeneficiairePoudreNutritive] = useState(false);
  const [beneficiairePlaquette, setBeneficiairePlaquette] = useState(false);
  const [dureeSejourJours, setDureeSejourJours] = useState('');
  const [observations, setObservations] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeSortie !== 'Transféré/référé') setDestinationProgramme('');
  }, [typeSortie]);

  useEffect(() => {
    let cancelled = false;
    api<PatientSummary>(`/api/patients/${params.id}`)
      .then((p) => {
        if (cancelled) return;
        setPatientName(`${p.nom}, ${p.prenom}`);
        const found = p.nutritions.find((n) => n.id === params.nutritionId) ?? null;
        setRecord(found);
        if (!found) {
          setLoadError('Fiche introuvable.');
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
  }, [params.id, params.nutritionId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const isUrenam = record?.type === 'URENAM';

    const body = {
      dateSortie: new Date(dateSortie).toISOString(),
      ...(typeSortie ? { typeSortie } : {}),
      ...(typeSortie === 'Transféré/référé' && destinationProgramme
        ? { destinationProgramme }
        : {}),
      ...(observations ? { observations } : {}),
      ...(!isUrenam
        ? {
            ...(poidsSortieKg ? { poidsSortieKg: Number(poidsSortieKg) } : {}),
            ...(tailleSortieCm ? { tailleSortieCm: Number(tailleSortieCm) } : {}),
            ...(perimetreBrachialSortieCm
              ? { perimetreBrachialSortieCm: Number(perimetreBrachialSortieCm) }
              : {}),
            ...(ptIndiceSortie ? { ptIndiceSortie } : {}),
            ...(oedemeSortie ? { oedemeSortie } : {}),
            ...(datePoidsMinimum
              ? { datePoidsMinimum: new Date(datePoidsMinimum).toISOString() }
              : {}),
            ...(poidsMinimumKg ? { poidsMinimumKg: Number(poidsMinimumKg) } : {}),
            ...(seancesStimulationPsychocognitive
              ? { seancesStimulationPsychocognitive: Number(seancesStimulationPsychocognitive) }
              : {}),
            ...(seancesCcsc ? { seancesCcsc: Number(seancesCcsc) } : {}),
          }
        : {
            beneficiairePoudreNutritive,
            beneficiairePlaquette,
            ...(dureeSejourJours ? { dureeSejourJours: Number(dureeSejourJours) } : {}),
          }),
    };

    try {
      await api(`/api/nutritions/${params.nutritionId}`, { method: 'PATCH', body });
      toast('Sortie enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre du mois d’admission est déjà clôturé — impossible d’enregistrer la sortie.'
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

  if (loadError || !record) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="registres" />
        <div className="flex min-h-[calc(100vh-61px)] items-center justify-center px-6">
          <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            {loadError ?? 'Fiche introuvable.'}
          </p>
        </div>
      </main>
    );
  }

  const isUrenam = record.type === 'URENAM';
  const title = isUrenam ? 'Clôturer l’épisode' : 'Enregistrer la sortie';

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
          / {title}
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-[#52514e]">
              {record.type} — admis(e) le {formatDate(record.date)}
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
              form="nutrition-sortie-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer'}
            </button>
          </div>
        </div>

        {(record.dateSortie || record.typeSortie) && (
          <p className="mb-4 rounded-md bg-[#d08a1c]/10 px-4 py-3 text-sm text-[#d08a1c]">
            Une issue a déjà été enregistrée — l&apos;enregistrer à nouveau remplacera ces
            informations.
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

        <form id="nutrition-sortie-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Issue</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Type de sortie" required>
                <select
                  className={inputClass}
                  value={typeSortie}
                  onChange={(e) => setTypeSortie(e.target.value)}
                  required
                >
                  <option value="">Sélectionner</option>
                  {TYPE_SORTIE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Date et heure de sortie" required>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={dateSortie}
                  onChange={(e) => setDateSortie(e.target.value)}
                  required
                />
              </Field>

              {typeSortie === 'Transféré/référé' && (
                <Field label="Structure de destination">
                  <select
                    className={inputClass}
                    value={destinationProgramme}
                    onChange={(e) => setDestinationProgramme(e.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {DESTINATION_PROGRAMME_OPTIONS[
                      record.type as 'URENI' | 'URENAS' | 'URENAM'
                    ]?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {!isUrenam && (
                <>
                  <Field label="Poids (kg)">
                    <input
                      type="number"
                      step="0.1"
                      className={inputClass}
                      value={poidsSortieKg}
                      onChange={(e) => setPoidsSortieKg(e.target.value)}
                    />
                  </Field>
                  <Field label="Taille (cm)">
                    <input
                      type="number"
                      step="0.1"
                      className={inputClass}
                      value={tailleSortieCm}
                      onChange={(e) => setTailleSortieCm(e.target.value)}
                    />
                  </Field>
                  <Field label="PB — périmètre brachial (cm)">
                    <input
                      type="number"
                      step="0.1"
                      className={inputClass}
                      value={perimetreBrachialSortieCm}
                      onChange={(e) => setPerimetreBrachialSortieCm(e.target.value)}
                    />
                  </Field>
                  <Field label="P/T de sortie">
                    <input
                      className={inputClass}
                      value={ptIndiceSortie}
                      onChange={(e) => setPtIndiceSortie(e.target.value)}
                    />
                  </Field>
                  <Field label="Œdèmes de sortie">
                    <select
                      className={inputClass}
                      value={oedemeSortie}
                      onChange={(e) => setOedemeSortie(e.target.value)}
                    >
                      <option value="">Sélectionner</option>
                      <option value="Non">Non</option>
                      <option value="+">+</option>
                      <option value="++">++</option>
                      <option value="+++">+++</option>
                    </select>
                  </Field>
                  <Field label="Date du poids minimum">
                    <input
                      type="date"
                      className={inputClass}
                      value={datePoidsMinimum}
                      onChange={(e) => setDatePoidsMinimum(e.target.value)}
                    />
                  </Field>
                  <Field label="Poids minimum (kg)">
                    <input
                      type="number"
                      step="0.1"
                      className={inputClass}
                      value={poidsMinimumKg}
                      onChange={(e) => setPoidsMinimumKg(e.target.value)}
                    />
                  </Field>
                  <Field label="Séances stimulation psychocognitive">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={seancesStimulationPsychocognitive}
                      onChange={(e) => setSeancesStimulationPsychocognitive(e.target.value)}
                    />
                  </Field>
                  <Field label="Séances CCSC">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={seancesCcsc}
                      onChange={(e) => setSeancesCcsc(e.target.value)}
                    />
                  </Field>
                </>
              )}

              {isUrenam && (
                <>
                  <Field label="Durée de séjour (jours)">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={dureeSejourJours}
                      onChange={(e) => setDureeSejourJours(e.target.value)}
                    />
                  </Field>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                      <input
                        type="checkbox"
                        checked={beneficiairePoudreNutritive}
                        onChange={(e) => setBeneficiairePoudreNutritive(e.target.checked)}
                        className="h-4 w-4 rounded border-[#e1e0d9]"
                      />
                      Bénéficiaire poudre nutritive
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                      <input
                        type="checkbox"
                        checked={beneficiairePlaquette}
                        onChange={(e) => setBeneficiairePlaquette(e.target.checked)}
                        className="h-4 w-4 rounded border-[#e1e0d9]"
                      />
                      Bénéficiaire plaquette
                    </label>
                  </div>
                </>
              )}

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
