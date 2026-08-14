'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

type NutritionType = 'URENI' | 'URENAS' | 'URENAM';

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

function BoolField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sélectionner</option>
        <option value="Oui">Oui</option>
        <option value="Non">Non</option>
      </select>
    </Field>
  );
}

const TYPE_LABEL: Record<NutritionType, string> = {
  URENI: 'URENI — Unité de Récupération Nutritionnelle Intensive',
  URENAS: 'URENAS — Ambulatoire sévère',
  URENAM: 'URENAM — Ambulatoire modéré',
};

const SELECTABLE_TYPES: NutritionType[] = ['URENI', 'URENAS', 'URENAM'];

const MODE_ADMISSION_OPTIONS: Record<'URENI' | 'URENAS', string[]> = {
  URENI: ['NC', 'Rechute', 'Réadmission', 'TN/REF'],
  URENAS: ['NC', 'Rechute', 'Réadmission', 'TN/TM'],
};

const PROVENANCE_PROGRAMME_OPTIONS: Record<'URENI' | 'URENAS', string[]> = {
  URENI: ['URENI', 'URENAS', 'URENAM'], // 'URENI' = transfert inter-établissement
  URENAS: ['URENI', 'URENAM'],
};

function todayLocalDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function NewNutritionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [type, setType] = useState<NutritionType>('URENI');

  const [date, setDate] = useState(todayLocalDate());
  const [numeroMas, setNumeroMas] = useState('');
  const [telephoneContact, setTelephoneContact] = useState('');
  const [localisationPrecise, setLocalisationPrecise] = useState('');
  const [ageMois, setAgeMois] = useState('');
  const [modeAdmission, setModeAdmission] = useState('');
  const [typeCas, setTypeCas] = useState('');
  const [poidsKg, setPoidsKg] = useState('');
  const [tailleCm, setTailleCm] = useState('');
  const [perimetreBrachialCm, setPerimetreBrachialCm] = useState('');
  const [ptIndice, setPtIndice] = useState('');
  const [oedemes, setOedemes] = useState('');
  const [pathologiesAssociees, setPathologiesAssociees] = useState('');

  const [nomPere, setNomPere] = useState('');
  const [nomMere, setNomMere] = useState('');
  const [allaite, setAllaite] = useState('');
  const [jumeaux, setJumeaux] = useState('');
  const [parentsVivants, setParentsVivants] = useState('');
  const [sourceAdmission, setSourceAdmission] = useState('');
  const [provenanceProgramme, setProvenanceProgramme] = useState('');
  const [carteVaccination, setCarteVaccination] = useState('');
  const [vaccinationAJour, setVaccinationAJour] = useState('');

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

  useEffect(() => {
    // Options differ per type — reset so a stale value from another type
    // can't be silently submitted (e.g. "TN/TM" while type === 'URENI', or a
    // provenanceProgramme option only valid for the previous type).
    setModeAdmission('');
    setTypeCas('');
    setSourceAdmission('');
    setProvenanceProgramme('');
  }, [type]);

  useEffect(() => {
    // provenanceProgramme only makes sense when sourceAdmission === 'Référé'
    // — clear it otherwise so a stale value isn't silently submitted.
    if (sourceAdmission !== 'Référé') setProvenanceProgramme('');
  }, [sourceAdmission]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = {
      type,
      date: new Date(date).toISOString(),
      ...(numeroMas ? { numeroMas } : {}),
      ...(telephoneContact ? { telephoneContact } : {}),
      ...(localisationPrecise ? { localisationPrecise } : {}),
      ...(ageMois ? { ageMois: Number(ageMois) } : {}),
      ...(type !== 'URENAM' && modeAdmission ? { modeAdmission } : {}),
      ...(type === 'URENAM' && typeCas ? { typeCas } : {}),
      ...(poidsKg ? { poidsKg: Number(poidsKg) } : {}),
      ...(tailleCm ? { tailleCm: Number(tailleCm) } : {}),
      ...(perimetreBrachialCm ? { perimetreBrachialCm: Number(perimetreBrachialCm) } : {}),
      ...(ptIndice ? { ptIndice } : {}),
      ...(oedemes ? { oedemes } : {}),
      ...(pathologiesAssociees ? { pathologiesAssociees } : {}),
      ...(type !== 'URENAM' && nomPere ? { nomPere } : {}),
      ...(type !== 'URENAM' && nomMere ? { nomMere } : {}),
      ...(type !== 'URENAM' && allaite ? { allaite: allaite === 'Oui' } : {}),
      ...(type !== 'URENAM' && jumeaux ? { jumeaux: jumeaux === 'Oui' } : {}),
      ...(type !== 'URENAM' && parentsVivants ? { parentsVivants: parentsVivants === 'Oui' } : {}),
      ...(sourceAdmission ? { sourceAdmission } : {}),
      ...(type !== 'URENAM' && sourceAdmission === 'Référé' && provenanceProgramme
        ? { provenanceProgramme }
        : {}),
      ...(type !== 'URENAM' && carteVaccination
        ? { carteVaccination: carteVaccination === 'Oui' }
        : {}),
      ...(type !== 'URENAM' && vaccinationAJour
        ? { vaccinationAJour: vaccinationAJour === 'Oui' }
        : {}),
    };

    try {
      await api(`/api/patients/${params.id}/nutrition`, { method: 'POST', body });
      toast('Fiche PCIMA enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre de ce mois est déjà clôturé — impossible d’ajouter une fiche.'
          : friendlyError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const ptLabel = type === 'URENI' ? 'P/T ou IMC' : 'P/T Z (Z-score)';

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
          / Nouvelle fiche PCIMA
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Nouvelle fiche PCIMA</h1>
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
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Registre</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SELECTABLE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                    type === t
                      ? 'border-[#2a78d6] bg-[#2a78d6]/10 text-[#2a78d6]'
                      : 'border-[#e1e0d9] bg-white text-[#52514e] hover:bg-[#f9f9f7]'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Informations générales</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Date et heure d'admission" required>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-[#898781]">
                  La date de sortie se renseigne plus tard, une fois l&apos;enfant sorti, via «
                  Enregistrer la sortie » sur la fiche patient.
                </p>
              </Field>
              <Field label="N° MAS">
                <input
                  className={inputClass}
                  placeholder="Numéro d'enregistrement programme"
                  value={numeroMas}
                  onChange={(e) => setNumeroMas(e.target.value)}
                />
              </Field>
              <Field label="Âge (mois)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={ageMois}
                  onChange={(e) => setAgeMois(e.target.value)}
                />
              </Field>
              {type !== 'URENAM' ? (
                <Field label="Mode d'admission">
                  <select
                    className={inputClass}
                    value={modeAdmission}
                    onChange={(e) => setModeAdmission(e.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {MODE_ADMISSION_OPTIONS[type].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Type de cas">
                  <select
                    className={inputClass}
                    value={typeCas}
                    onChange={(e) => setTypeCas(e.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    <option value="NC">Nouveau cas (NC)</option>
                    <option value="AC">Ancien cas (AC)</option>
                    <option value="Réadmission">Réadmission</option>
                  </select>
                </Field>
              )}
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
              <Field label={ptLabel}>
                <input
                  className={inputClass}
                  placeholder="Ex: -3 ET"
                  value={ptIndice}
                  onChange={(e) => setPtIndice(e.target.value)}
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
              <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="N° de téléphone">
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="Numéro du parent/accompagnant"
                    value={telephoneContact}
                    onChange={(e) => setTelephoneContact(e.target.value)}
                  />
                </Field>
                <Field label="Localisation précise">
                  <input
                    className={inputClass}
                    placeholder="Quartier, rue, repère"
                    value={localisationPrecise}
                    onChange={(e) => setLocalisationPrecise(e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Pathologies associées">
                  <input
                    className={inputClass}
                    value={pathologiesAssociees}
                    onChange={(e) => setPathologiesAssociees(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Contexte de l&apos;admission</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Source d'admission">
                <select
                  className={inputClass}
                  value={sourceAdmission}
                  onChange={(e) => setSourceAdmission(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Référé">Référé</option>
                  <option value="Spontané">Spontané</option>
                  <option value="Dépistage actif">Dépistage actif</option>
                </select>
              </Field>
              {type !== 'URENAM' && sourceAdmission === 'Référé' && (
                <Field label="Programme d'origine">
                  <select
                    className={inputClass}
                    value={provenanceProgramme}
                    onChange={(e) => setProvenanceProgramme(e.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {PROVENANCE_PROGRAMME_OPTIONS[type].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {type !== 'URENAM' && (
                <>
                  <Field label="Nom du père">
                    <input
                      className={inputClass}
                      value={nomPere}
                      onChange={(e) => setNomPere(e.target.value)}
                    />
                  </Field>
                  <Field label="Nom de la mère">
                    <input
                      className={inputClass}
                      value={nomMere}
                      onChange={(e) => setNomMere(e.target.value)}
                    />
                  </Field>
                  <BoolField label="Allaité(e)" value={allaite} onChange={setAllaite} />
                  <BoolField label="Jumeaux" value={jumeaux} onChange={setJumeaux} />
                  <BoolField
                    label="Parents vivants"
                    value={parentsVivants}
                    onChange={setParentsVivants}
                  />
                  <BoolField
                    label="Carte de vaccination"
                    value={carteVaccination}
                    onChange={setCarteVaccination}
                  />
                  <BoolField
                    label="Vaccination à jour"
                    value={vaccinationAJour}
                    onChange={setVaccinationAJour}
                  />
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
