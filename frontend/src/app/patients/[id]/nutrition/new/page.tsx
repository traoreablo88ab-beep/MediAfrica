'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

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

export default function NewNutritionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [typeCas, setTypeCas] = useState('');
  const [poidsKg, setPoidsKg] = useState('');
  const [tailleCm, setTailleCm] = useState('');
  const [perimetreBrachialCm, setPerimetreBrachialCm] = useState('');
  const [oedemes, setOedemes] = useState('');
  const [statutPT, setStatutPT] = useState('');
  const [classification, setClassification] = useState('');
  const [testAppetit, setTestAppetit] = useState('');

  const [complicationsMedicales, setComplicationsMedicales] = useState('');
  const [priseEnCharge, setPriseEnCharge] = useState('');
  const [atpe, setAtpe] = useState(false);
  const [laitF75, setLaitF75] = useState(false);
  const [laitF100, setLaitF100] = useState(false);
  const [amoxicilline, setAmoxicilline] = useState(false);
  const [vitamineA, setVitamineA] = useState(false);
  const [deparasitant, setDeparasitant] = useState(false);
  const [traitementAutre, setTraitementAutre] = useState('');

  const [numeroVisiteSuivi, setNumeroVisiteSuivi] = useState('');
  const [evolution, setEvolution] = useState('');
  const [prochainRdv, setProchainRdv] = useState('');
  const [observations, setObservations] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ nom: string; prenom: string }>(`/api/patients/${params.id}`)
      .then((p) => {
        if (!cancelled) setPatientName(`${p.nom}, ${p.prenom}`);
      })
      .catch(() => {
        // Non-fatal — the form still works without the breadcrumb name.
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = {
      ...(typeCas ? { typeCas } : {}),
      ...(poidsKg ? { poidsKg: Number(poidsKg) } : {}),
      ...(tailleCm ? { tailleCm: Number(tailleCm) } : {}),
      ...(perimetreBrachialCm ? { perimetreBrachialCm: Number(perimetreBrachialCm) } : {}),
      ...(oedemes ? { oedemes } : {}),
      ...(statutPT ? { statutPT } : {}),
      ...(classification ? { classification } : {}),
      ...(testAppetit ? { testAppetit } : {}),

      ...(complicationsMedicales ? { complicationsMedicales } : {}),
      ...(priseEnCharge ? { priseEnCharge } : {}),
      atpe,
      laitF75,
      laitF100,
      amoxicilline,
      vitamineA,
      deparasitant,
      ...(traitementAutre ? { traitementAutre } : {}),

      ...(numeroVisiteSuivi ? { numeroVisiteSuivi: Number(numeroVisiteSuivi) } : {}),
      ...(evolution ? { evolution } : {}),
      ...(prochainRdv ? { prochainRdv } : {}),
      ...(observations ? { observations } : {}),
    };

    try {
      await api(`/api/patients/${params.id}/nutrition`, { method: 'POST', body });
      toast('Fiche nutrition enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre de nutrition de ce mois est déjà clôturé — impossible d’ajouter une fiche.'
          : friendlyError(err),
      );
    } finally {
      setSubmitting(false);
    }
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
          / Nouvelle fiche nutrition
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Nouvelle fiche nutrition</h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-nutrition-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer la fiche'}
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

        <form id="new-nutrition-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Dépistage anthropométrique</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Type de cas">
                <select
                  className={inputClass}
                  value={typeCas}
                  onChange={(e) => setTypeCas(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="NC">Nouveau cas (NC)</option>
                  <option value="AC">Ancien cas (AC)</option>
                </select>
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
              <Field label="Œdèmes bilatéraux">
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
              <Field label="P/T — indice Poids/Taille">
                <input
                  className={inputClass}
                  placeholder="Ex: -2 ET, Normal…"
                  value={statutPT}
                  onChange={(e) => setStatutPT(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Classification PCIMA</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Classification">
                <select
                  className={inputClass}
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Normal">Normal</option>
                  <option value="MAM">MAM — Malnutrition Aiguë Modérée</option>
                  <option value="MAS sans complication">MAS sans complication</option>
                  <option value="MAS avec complication">MAS avec complication</option>
                </select>
              </Field>
              <Field label="Test de l'appétit">
                <select
                  className={inputClass}
                  value={testAppetit}
                  onChange={(e) => setTestAppetit(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Bon">Bon</option>
                  <option value="Faible/Échec">Faible/Échec</option>
                </select>
              </Field>
              <Field label="Prise en charge">
                <select
                  className={inputClass}
                  value={priseEnCharge}
                  onChange={(e) => setPriseEnCharge(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Aucune">Aucune</option>
                  <option value="URENAM">URENAM</option>
                  <option value="URENI">URENI</option>
                  <option value="URENAS">URENAS</option>
                </select>
              </Field>
              <Field label="Complications médicales">
                <input
                  className={inputClass}
                  value={complicationsMedicales}
                  onChange={(e) => setComplicationsMedicales(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Traitement donné</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={atpe}
                  onChange={(e) => setAtpe(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                ATPE (Plumpy&apos;nut)
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={laitF75}
                  onChange={(e) => setLaitF75(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Lait thérapeutique F75
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={laitF100}
                  onChange={(e) => setLaitF100(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Lait thérapeutique F100
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={amoxicilline}
                  onChange={(e) => setAmoxicilline(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Amoxicilline
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={vitamineA}
                  onChange={(e) => setVitamineA(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Vitamine A
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={deparasitant}
                  onChange={(e) => setDeparasitant(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Déparasitant
              </label>
            </div>
            <div className="mt-4">
              <Field label="Autre traitement">
                <input
                  className={inputClass}
                  value={traitementAutre}
                  onChange={(e) => setTraitementAutre(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Suivi</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="N° visite de suivi">
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={numeroVisiteSuivi}
                  onChange={(e) => setNumeroVisiteSuivi(e.target.value)}
                />
              </Field>
              <Field label="Évolution">
                <select
                  className={inputClass}
                  value={evolution}
                  onChange={(e) => setEvolution(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="En cours">En cours</option>
                  <option value="Guéri">Guéri</option>
                  <option value="Abandon">Abandon</option>
                  <option value="Décès">Décès</option>
                  <option value="Référé">Référé</option>
                  <option value="Non-répondant">Non-répondant</option>
                </select>
              </Field>
              <Field label="Prochain rendez-vous">
                <input
                  type="date"
                  className={inputClass}
                  value={prochainRdv}
                  onChange={(e) => setProchainRdv(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-3">
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
