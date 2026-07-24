'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

const GROUPES_SANGUINS = ['Inconnu', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
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

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [age, setAge] = useState('');
  const [sexe, setSexe] = useState('');
  const [telephonePrincipal, setTelephonePrincipal] = useState('');
  const [telephoneSecondaire, setTelephoneSecondaire] = useState('');
  const [communeResidence, setCommuneResidence] = useState('');
  const [quartierVillage, setQuartierVillage] = useState('');
  const [contactUrgence, setContactUrgence] = useState('');
  const [numeroRamed, setNumeroRamed] = useState('');
  const [numeroAmo, setNumeroAmo] = useState('');
  const [groupeSanguin, setGroupeSanguin] = useState('Inconnu');
  const [allergiesConnues, setAllergiesConnues] = useState('');
  const [antecedentsPersonnels, setAntecedentsPersonnels] = useState('');
  const [antecedentsFamiliaux, setAntecedentsFamiliaux] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existingPatientId: string;
    existingDossierNumber: string;
  } | null>(null);

  async function submitPatient(force: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      // Only the age is asked (common in this context — exact birthdates are
      // often unknown). Approximated as Jan 1st of the birth year, since the
      // Patient model still needs a dateNaissance to compute age elsewhere.
      const birthYear = new Date().getFullYear() - Number(age);
      const dateNaissance = `${birthYear}-01-01`;

      const created = await api<{ id: string }>('/api/patients', {
        method: 'POST',
        body: {
          nom,
          prenom,
          dateNaissance,
          sexe,
          telephonePrincipal,
          ...(telephoneSecondaire ? { telephoneSecondaire } : {}),
          communeResidence,
          ...(quartierVillage ? { quartierVillage } : {}),
          ...(contactUrgence ? { contactUrgenceNom: contactUrgence } : {}),
          ...(numeroRamed ? { numeroRamed } : {}),
          ...(numeroAmo ? { numeroAmo } : {}),
          ...(groupeSanguin !== 'Inconnu' ? { groupeSanguin } : {}),
          ...(allergiesConnues ? { allergiesConnues } : {}),
          ...(antecedentsPersonnels ? { antecedentsPersonnels } : {}),
          ...(antecedentsFamiliaux ? { antecedentsFamiliaux } : {}),
          ...(force ? { force: true } : {}),
        },
      });
      toast('Patient créé avec succès.');
      router.push(`/patients/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_PATIENT') {
        setDuplicateWarning({
          message: typeof err.body.message === 'string' ? err.body.message : friendlyError(err),
          existingPatientId: String(err.body.existingPatientId ?? ''),
          existingDossierNumber: String(err.body.existingDossierNumber ?? ''),
        });
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDuplicateWarning(null);
    void submitPatient(false);
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="patients" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/patients" className="hover:underline">
            Patients
          </Link>{' '}
          / Nouveau dossier
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Créer un nouveau dossier patient</h1>
            <p className="mt-1 text-sm text-[#52514e]">
              Un numéro de dossier sera attribué automatiquement après enregistrement.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/patients"
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-patient-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer le patient'}
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

        {duplicateWarning && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-2 rounded-md border border-[#fab219]/40 bg-[#fab219]/10 px-4 py-3 text-sm text-[#0b0b0b] sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              {duplicateWarning.message}{' '}
              <Link
                href={`/patients/${duplicateWarning.existingPatientId}`}
                className="font-medium text-[#2a78d6] hover:underline"
              >
                Voir ce dossier
              </Link>
            </span>
            <button
              type="button"
              onClick={() => void submitPatient(true)}
              disabled={submitting}
              className="whitespace-nowrap rounded-md border border-[#e1e0d9] bg-white px-3 py-1.5 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
            >
              Créer quand même
            </button>
          </div>
        )}

        <form
          id="new-patient-form"
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        >
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-4 font-semibold text-[#0b0b0b]">Identité du patient</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nom de famille" required>
                  <input
                    className={inputClass}
                    placeholder="Ex: Keïta"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Prénom(s)" required>
                  <input
                    className={inputClass}
                    placeholder="Ex: Fatoumata"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Âge (années)" required>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className={inputClass}
                    placeholder="Ex: 34"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Sexe" required>
                  <select
                    className={inputClass}
                    value={sexe}
                    onChange={(e) => setSexe(e.target.value)}
                    required
                  >
                    <option value="">Sélectionner</option>
                    <option value="F">Féminin</option>
                    <option value="M">Masculin</option>
                  </select>
                </Field>
                <Field label="Téléphone principal" required>
                  <input
                    className={inputClass}
                    placeholder="+223 76 01 23 45"
                    value={telephonePrincipal}
                    onChange={(e) => setTelephonePrincipal(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-[#898781]">
                    Toujours commencer par + suivi de l’indicatif pays (+223 pour le Mali).
                  </p>
                </Field>
                <Field label="Téléphone secondaire (optionnel)">
                  <input
                    className={inputClass}
                    placeholder="+223 76 01 23 45"
                    value={telephoneSecondaire}
                    onChange={(e) => setTelephoneSecondaire(e.target.value)}
                  />
                </Field>
                <Field label="Commune de résidence" required>
                  <input
                    className={inputClass}
                    placeholder="Ex: Commune V, Bamako"
                    value={communeResidence}
                    onChange={(e) => setCommuneResidence(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Quartier / village">
                  <input
                    className={inputClass}
                    placeholder="Ex: Lafiabougou"
                    value={quartierVillage}
                    onChange={(e) => setQuartierVillage(e.target.value)}
                  />
                </Field>
                <Field label="Contact en cas d’urgence">
                  <input
                    className={inputClass}
                    placeholder="Nom et téléphone"
                    value={contactUrgence}
                    onChange={(e) => setContactUrgence(e.target.value)}
                  />
                </Field>
                <Field label="N° RAMED / assurance">
                  <input
                    className={inputClass}
                    placeholder="RM-XXXX-XXXXX"
                    value={numeroRamed}
                    onChange={(e) => setNumeroRamed(e.target.value)}
                  />
                </Field>
                <Field label="N° AMO">
                  <input
                    className={inputClass}
                    placeholder="AMO-XXXX-XXXXX"
                    value={numeroAmo}
                    onChange={(e) => setNumeroAmo(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-4 font-semibold text-[#0b0b0b]">
                Informations médicales initiales
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Groupe sanguin">
                  <select
                    className={inputClass}
                    value={groupeSanguin}
                    onChange={(e) => setGroupeSanguin(e.target.value)}
                  >
                    {GROUPES_SANGUINS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Allergies connues">
                  <input
                    className={inputClass}
                    placeholder="Ex: Pénicilline, Aspirine…"
                    value={allergiesConnues}
                    onChange={(e) => setAllergiesConnues(e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Antécédents personnels">
                    <textarea
                      className={inputClass}
                      rows={3}
                      placeholder="Maladies chroniques, chirurgies passées…"
                      value={antecedentsPersonnels}
                      onChange={(e) => setAntecedentsPersonnels(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Antécédents familiaux">
                    <textarea
                      className={inputClass}
                      rows={3}
                      placeholder="Diabète, HTA, autres dans la famille…"
                      value={antecedentsFamiliaux}
                      onChange={(e) => setAntecedentsFamiliaux(e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#0b0b0b]">Progression du dossier</h3>
              <ul className="flex flex-col gap-2 text-sm text-[#52514e]">
                <li>☐ Identité</li>
                <li>☐ Informations médicales</li>
                <li>☐ Documents</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[#0ca30c]/30 bg-[#0ca30c]/5 p-5">
              <h3 className="mb-2 text-sm font-semibold text-[#0ca30c]">Champs obligatoires</h3>
              <ul className="flex flex-col gap-1 text-sm text-[#52514e]">
                <li>— Nom et prénom</li>
                <li>— Âge</li>
                <li>— Sexe</li>
                <li>— Téléphone principal</li>
                <li>— Commune de résidence</li>
              </ul>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
