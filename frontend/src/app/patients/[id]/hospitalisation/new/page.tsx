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

const SERVICE_OPTIONS = [
  'Médecine',
  'Chirurgie',
  'Pédiatrie',
  'Maternité',
  'Réanimation',
  'Urgences',
  'Néonatologie',
  'Autre',
];

function todayLocalDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function NewHospitalisationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [dateHeureEntree, setDateHeureEntree] = useState(todayLocalDate());
  const [dateHeureSortie, setDateHeureSortie] = useState('');
  const [motifAdmission, setMotifAdmission] = useState('');
  const [service, setService] = useState('');
  const [numeroHospitalisation, setNumeroHospitalisation] = useState('');
  const [referenceOrigine, setReferenceOrigine] = useState('');
  const [profession, setProfession] = useState('');
  const [indigent, setIndigent] = useState(false);
  const [telephoneContact, setTelephoneContact] = useState('');
  const [localisationPrecise, setLocalisationPrecise] = useState('');
  const [diagnosticPrincipal, setDiagnosticPrincipal] = useState('');
  const [diagnosticsSecondaires, setDiagnosticsSecondaires] = useState('');
  const [traitementRecu, setTraitementRecu] = useState('');
  const [praticienResponsable, setPraticienResponsable] = useState('');
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
      dateHeureEntree: new Date(dateHeureEntree).toISOString(),
      motifAdmission,
      indigent,
      ...(dateHeureSortie ? { dateHeureSortie: new Date(dateHeureSortie).toISOString() } : {}),
      ...(service ? { service } : {}),
      ...(numeroHospitalisation ? { numeroHospitalisation } : {}),
      ...(referenceOrigine ? { referenceOrigine } : {}),
      ...(profession ? { profession } : {}),
      ...(telephoneContact ? { telephoneContact } : {}),
      ...(localisationPrecise ? { localisationPrecise } : {}),
      ...(diagnosticPrincipal ? { diagnosticPrincipal } : {}),
      ...(diagnosticsSecondaires ? { diagnosticsSecondaires } : {}),
      ...(traitementRecu ? { traitementRecu } : {}),
      ...(praticienResponsable ? { praticienResponsable } : {}),
      ...(observations ? { observations } : {}),
    };

    try {
      await api(`/api/patients/${params.id}/hospitalisation`, { method: 'POST', body });
      toast('Admission enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre d’hospitalisation de ce mois est déjà clôturé — impossible d’ajouter une admission.'
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
          / Nouvelle admission
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Nouvelle admission</h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-hospitalisation-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer l’admission'}
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

        <form id="new-hospitalisation-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Admission</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Motif d'admission" required>
                  <input
                    className={inputClass}
                    placeholder="Ex: Paludisme grave avec anémie"
                    value={motifAdmission}
                    onChange={(e) => setMotifAdmission(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Date et heure d'entrée" required>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={dateHeureEntree}
                  onChange={(e) => setDateHeureEntree(e.target.value)}
                  required
                />
              </Field>
              <Field label="Date et heure de sortie">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={dateHeureSortie}
                  onChange={(e) => setDateHeureSortie(e.target.value)}
                />
                <p className="mt-1 text-xs text-[#898781]">
                  Laisser vide si le patient est encore hospitalisé — utilisez « Enregistrer la
                  sortie » plus tard.
                </p>
              </Field>
              <Field label="Service">
                <select
                  className={inputClass}
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {SERVICE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Médecin responsable">
                <input
                  className={inputClass}
                  value={praticienResponsable}
                  onChange={(e) => setPraticienResponsable(e.target.value)}
                />
              </Field>
              <Field label="N° d'hospitalisation">
                <input
                  className={inputClass}
                  placeholder="Numéro du cahier de registre"
                  value={numeroHospitalisation}
                  onChange={(e) => setNumeroHospitalisation(e.target.value)}
                />
              </Field>
              <Field label="Référence / provenance">
                <select
                  className={inputClass}
                  value={referenceOrigine}
                  onChange={(e) => setReferenceOrigine(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Non référé">Non référé</option>
                  <option value="Cscom">Cscom</option>
                  <option value="Csref">Csref</option>
                  <option value="HR">HR</option>
                  <option value="HN">HN</option>
                  <option value="Cabinet Med Privé">Cabinet Med Privé</option>
                  <option value="Cabinet soins Privé">Cabinet soins Privé</option>
                  <option value="Clinique privée">Clinique privée</option>
                </select>
              </Field>
              <Field label="Profession">
                <input
                  className={inputClass}
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="N° de téléphone">
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="Numéro du patient ou d'un accompagnant"
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
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={indigent}
                    onChange={(e) => setIndigent(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9] text-[#2a78d6] focus:ring-[#2a78d6]"
                  />
                  Patient indigent
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Diagnostic et traitement</h2>
            <div className="grid grid-cols-1 gap-4">
              <Field label="Diagnostic principal">
                <input
                  className={inputClass}
                  value={diagnosticPrincipal}
                  onChange={(e) => setDiagnosticPrincipal(e.target.value)}
                />
              </Field>
              <Field label="Diagnostics secondaires">
                <input
                  className={inputClass}
                  value={diagnosticsSecondaires}
                  onChange={(e) => setDiagnosticsSecondaires(e.target.value)}
                />
              </Field>
              <Field label="Traitement reçu">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={traitementRecu}
                  onChange={(e) => setTraitementRecu(e.target.value)}
                />
              </Field>
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
        </form>
      </div>
    </main>
  );
}
