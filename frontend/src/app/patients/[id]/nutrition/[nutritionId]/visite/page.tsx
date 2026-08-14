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
  visites: Array<{ numeroVisite: number }>;
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

const VISIT_NUMBER_LABEL: Record<string, string> = {
  URENI: 'Jour',
  URENAS: 'Semaine',
  URENAM: 'Visite',
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

export default function NutritionVisitePage() {
  const params = useParams<{ id: string; nutritionId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [record, setRecord] = useState<NutritionSummary | null>(null);

  const [date, setDate] = useState(todayLocalDate());
  const [poidsKg, setPoidsKg] = useState('');
  const [tailleCm, setTailleCm] = useState('');
  const [perimetreBrachialCm, setPerimetreBrachialCm] = useState('');
  const [ptIndice, setPtIndice] = useState('');
  const [oedemes, setOedemes] = useState('');
  const [type, setType] = useState('');

  const [testAppetit, setTestAppetit] = useState('');
  const [diarrheeJours, setDiarrheeJours] = useState('');
  const [vomissementJours, setVomissementJours] = useState('');
  const [fievreJours, setFievreJours] = useState('');
  const [touxJours, setTouxJours] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [resultatTestPalu, setResultatTestPalu] = useState('');
  const [atpeSachets, setAtpeSachets] = useState('');
  const [dermatoses, setDermatoses] = useState('');
  const [alerteLethargique, setAlerteLethargique] = useState('');
  const [frequenceRespiratoireMin, setFrequenceRespiratoireMin] = useState('');
  const [seancesEducationNutritionnelle, setSeancesEducationNutritionnelle] = useState('');
  const [seancesStimulation, setSeancesStimulation] = useState('');
  const [observations, setObservations] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PatientSummary>(`/api/patients/${params.id}`)
      .then((p) => {
        if (cancelled) return;
        setPatientName(`${p.nom}, ${p.prenom}`);
        const found = p.nutritions.find((n) => n.id === params.nutritionId) ?? null;
        setRecord(found);
        if (!found) setLoadError('Fiche introuvable.');
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

    const body = {
      date: new Date(date).toISOString(),
      ...(poidsKg ? { poidsKg: Number(poidsKg) } : {}),
      ...(tailleCm ? { tailleCm: Number(tailleCm) } : {}),
      ...(perimetreBrachialCm ? { perimetreBrachialCm: Number(perimetreBrachialCm) } : {}),
      ...(ptIndice ? { ptIndice } : {}),
      ...(oedemes ? { oedemes } : {}),
      ...(type ? { type } : {}),
      ...(testAppetit ? { testAppetit } : {}),
      ...(diarrheeJours ? { diarrheeJours: Number(diarrheeJours) } : {}),
      ...(vomissementJours ? { vomissementJours: Number(vomissementJours) } : {}),
      ...(fievreJours ? { fievreJours: Number(fievreJours) } : {}),
      ...(touxJours ? { touxJours: Number(touxJours) } : {}),
      ...(temperatureC ? { temperatureC: Number(temperatureC) } : {}),
      ...(resultatTestPalu ? { resultatTestPalu } : {}),
      ...(atpeSachets ? { atpeSachets: Number(atpeSachets) } : {}),
      ...(dermatoses ? { dermatoses } : {}),
      ...(alerteLethargique ? { alerteLethargique } : {}),
      ...(frequenceRespiratoireMin
        ? { frequenceRespiratoireMin: Number(frequenceRespiratoireMin) }
        : {}),
      ...(seancesEducationNutritionnelle
        ? { seancesEducationNutritionnelle: Number(seancesEducationNutritionnelle) }
        : {}),
      ...(seancesStimulation ? { seancesStimulation: Number(seancesStimulation) } : {}),
      ...(observations ? { observations } : {}),
    };

    try {
      await api(`/api/nutritions/${params.nutritionId}/visites`, { method: 'POST', body });
      toast('Visite enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre du mois d’admission est déjà clôturé — impossible d’ajouter une visite.'
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

  const nextVisiteNumber = (record.visites.at(-1)?.numeroVisite ?? 0) + 1;

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
          / Ajouter une visite
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">
              {VISIT_NUMBER_LABEL[record.type] ?? 'Visite'} n°{nextVisiteNumber}
            </h1>
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
              form="nutrition-visite-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer la visite'}
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        <form id="nutrition-visite-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Mesures de la visite</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Date et heure" required>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Poids (kg)">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={poidsKg}
                  onChange={(e) => setPoidsKg(e.target.value)}
                />
              </Field>
              <Field label="Taille (cm)">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={tailleCm}
                  onChange={(e) => setTailleCm(e.target.value)}
                />
              </Field>
              <Field label="PB — périmètre brachial (cm)">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={perimetreBrachialCm}
                  onChange={(e) => setPerimetreBrachialCm(e.target.value)}
                />
              </Field>
              <Field label="P/T Z">
                <input
                  className={inputClass}
                  value={ptIndice}
                  onChange={(e) => setPtIndice(e.target.value)}
                />
              </Field>
              <Field label="Œdèmes">
                <select
                  className={inputClass}
                  value={oedemes}
                  onChange={(e) => setOedemes(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Non">Non</option>
                  <option value="+">+</option>
                  <option value="++">++</option>
                  <option value="+++">+++</option>
                </select>
              </Field>
              <div className="sm:col-span-3">
                <Field label="Statut de la visite">
                  <input
                    className={inputClass}
                    placeholder="Ex: Poursuite, Amélioration…"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Suivi clinique</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Test de l'appétit">
                <select
                  className={inputClass}
                  value={testAppetit}
                  onChange={(e) => setTestAppetit(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Bon">Bon</option>
                  <option value="Moyen">Moyen</option>
                  <option value="Faible">Faible</option>
                </select>
              </Field>
              <Field label="Diarrhée (jours)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={diarrheeJours}
                  onChange={(e) => setDiarrheeJours(e.target.value)}
                />
              </Field>
              <Field label="Vomissement (jours)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={vomissementJours}
                  onChange={(e) => setVomissementJours(e.target.value)}
                />
              </Field>
              <Field label="Fièvre (jours)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={fievreJours}
                  onChange={(e) => setFievreJours(e.target.value)}
                />
              </Field>
              <Field label="Toux (jours)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={touxJours}
                  onChange={(e) => setTouxJours(e.target.value)}
                />
              </Field>
              <Field label="Température (°C)">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(e.target.value)}
                />
              </Field>
              <Field label="Test palu">
                <select
                  className={inputClass}
                  value={resultatTestPalu}
                  onChange={(e) => setResultatTestPalu(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="0">Non fait</option>
                  <option value="-">Négatif</option>
                  <option value="+">Positif</option>
                </select>
              </Field>
              <Field label="Sachets ATPE distribués">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={atpeSachets}
                  onChange={(e) => setAtpeSachets(e.target.value)}
                />
              </Field>
              <Field label="Fréquence respiratoire (/min)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={frequenceRespiratoireMin}
                  onChange={(e) => setFrequenceRespiratoireMin(e.target.value)}
                />
              </Field>
              <Field label="Dermatoses">
                <input
                  className={inputClass}
                  value={dermatoses}
                  onChange={(e) => setDermatoses(e.target.value)}
                />
              </Field>
              <Field label="État de conscience">
                <select
                  className={inputClass}
                  value={alerteLethargique}
                  onChange={(e) => setAlerteLethargique(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Alerte">Alerte</option>
                  <option value="Léthargique">Léthargique</option>
                </select>
              </Field>
              <Field label="Séances d'éducation nutritionnelle">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={seancesEducationNutritionnelle}
                  onChange={(e) => setSeancesEducationNutritionnelle(e.target.value)}
                />
              </Field>
              <Field label="Séances de stimulation">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={seancesStimulation}
                  onChange={(e) => setSeancesStimulation(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-3">
                <Field label="Observations">
                  <textarea
                    className={inputClass}
                    rows={3}
                    placeholder="Médicaments, traitement spécifique, laboratoire…"
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
