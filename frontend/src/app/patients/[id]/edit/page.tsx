'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

const GROUPES_SANGUINS = ['Inconnu', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface PatientDetail {
  id: string;
  dossierNumber: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: string;
  telephonePrincipal: string;
  telephoneSecondaire: string | null;
  communeResidence: string;
  quartierVillage: string | null;
  contactUrgenceNom: string | null;
  numeroRamed: string | null;
  numeroAmo: string | null;
  groupeSanguin: string | null;
  allergiesConnues: string | null;
  antecedentsPersonnels: string | null;
  antecedentsChirurgicaux: string | null;
  antecedentsFamiliaux: string | null;
}

function computeAge(dateNaissanceIso: string): number {
  const dob = new Date(dateNaissanceIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

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

export default function EditPatientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dossierNumber, setDossierNumber] = useState('');

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
  const [antecedentsChirurgicaux, setAntecedentsChirurgicaux] = useState('');
  const [antecedentsFamiliaux, setAntecedentsFamiliaux] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const p = await api<PatientDetail>(`/api/patients/${params.id}`);
        if (cancelled) return;
        setDossierNumber(p.dossierNumber);
        setNom(p.nom);
        setPrenom(p.prenom);
        setAge(String(computeAge(p.dateNaissance)));
        setSexe(p.sexe);
        setTelephonePrincipal(p.telephonePrincipal);
        setTelephoneSecondaire(p.telephoneSecondaire ?? '');
        setCommuneResidence(p.communeResidence);
        setQuartierVillage(p.quartierVillage ?? '');
        setContactUrgence(p.contactUrgenceNom ?? '');
        setNumeroRamed(p.numeroRamed ?? '');
        setNumeroAmo(p.numeroAmo ?? '');
        setGroupeSanguin(p.groupeSanguin ?? 'Inconnu');
        setAllergiesConnues(p.allergiesConnues ?? '');
        setAntecedentsPersonnels(p.antecedentsPersonnels ?? '');
        setAntecedentsChirurgicaux(p.antecedentsChirurgicaux ?? '');
        setAntecedentsFamiliaux(p.antecedentsFamiliaux ?? '');
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError && err.status === 404
              ? 'Patient introuvable.'
              : friendlyError(err),
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
  }, [params.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const birthYear = new Date().getFullYear() - Number(age);
      const dateNaissance = `${birthYear}-01-01`;

      await api(`/api/patients/${params.id}`, {
        method: 'PATCH',
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
          ...(antecedentsChirurgicaux ? { antecedentsChirurgicaux } : {}),
          ...(antecedentsFamiliaux ? { antecedentsFamiliaux } : {}),
        },
      });
      toast('Dossier mis à jour avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setSubmitError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="patients" />
        <div className="flex min-h-[calc(100vh-61px)] items-center justify-center">
          <p className="text-sm text-[#52514e]">Chargement…</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="patients" />
        <div className="flex min-h-[calc(100vh-61px)] items-center justify-center px-6">
          <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="patients" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/patients" className="hover:underline">
            Patients
          </Link>{' '}
          /{' '}
          <Link href={`/patients/${params.id}`} className="hover:underline">
            {nom}, {prenom}
          </Link>{' '}
          / Modifier
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Modifier le dossier</h1>
            <p className="mt-1 text-sm text-[#52514e]">{dossierNumber}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="edit-patient-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer les modifications'}
            </button>
          </div>
        </div>

        {submitError && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {submitError}
          </p>
        )}

        <form
          id="edit-patient-form"
          onSubmit={onSubmit}
          className="flex flex-col gap-6 lg:col-span-2"
        >
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Identité du patient</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nom de famille" required>
                <input
                  className={inputClass}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                />
              </Field>
              <Field label="Prénom(s)" required>
                <input
                  className={inputClass}
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
                  <option value="F">Féminin</option>
                  <option value="M">Masculin</option>
                </select>
              </Field>
              <Field label="Téléphone principal" required>
                <input
                  className={inputClass}
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
                  value={telephoneSecondaire}
                  onChange={(e) => setTelephoneSecondaire(e.target.value)}
                />
              </Field>
              <Field label="Commune de résidence" required>
                <input
                  className={inputClass}
                  value={communeResidence}
                  onChange={(e) => setCommuneResidence(e.target.value)}
                  required
                />
              </Field>
              <Field label="Quartier / village">
                <input
                  className={inputClass}
                  value={quartierVillage}
                  onChange={(e) => setQuartierVillage(e.target.value)}
                />
              </Field>
              <Field label="Contact en cas d’urgence">
                <input
                  className={inputClass}
                  value={contactUrgence}
                  onChange={(e) => setContactUrgence(e.target.value)}
                />
              </Field>
              <Field label="N° RAMED / assurance">
                <input
                  className={inputClass}
                  value={numeroRamed}
                  onChange={(e) => setNumeroRamed(e.target.value)}
                />
              </Field>
              <Field label="N° AMO">
                <input
                  className={inputClass}
                  value={numeroAmo}
                  onChange={(e) => setNumeroAmo(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Informations médicales</h2>
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
                  value={allergiesConnues}
                  onChange={(e) => setAllergiesConnues(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Antécédents personnels">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={antecedentsPersonnels}
                    onChange={(e) => setAntecedentsPersonnels(e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Antécédents chirurgicaux">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={antecedentsChirurgicaux}
                    onChange={(e) => setAntecedentsChirurgicaux(e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Antécédents familiaux">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={antecedentsFamiliaux}
                    onChange={(e) => setAntecedentsFamiliaux(e.target.value)}
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
