'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { queueMutation } from '@/lib/offlineQueue';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

// Liste exacte du registre PEV officiel (colonnes 8-45).
const ANTIGENES = [
  'BCG',
  'Hépatite B',
  'VPO0',
  'VPO1',
  'VPO2',
  'VPO3',
  'VPI1',
  'VPI2',
  'Penta1',
  'Penta2',
  'Penta3',
  'PCV13-1',
  'PCV13-2',
  'PCV13-3',
  'Rota1',
  'Rota2',
  'Rota3',
  'VAR1',
  'VAR2',
  'VAA',
  'MenSCV',
  'MenAfriVac',
  'MILD',
  'Vitamine A-1',
  'Vitamine A-2',
  'Vitamine A-3',
  'Albendazole',
  'HPV Cible scolarisée',
  'HPV Cible non scolarisée',
  'HPV 2ème dose (immunodéprimées)',
  'Vaccin anti-palu R21-1',
  'Vaccin anti-palu R21-2',
  'Vaccin anti-palu R21-3',
  'Rappel 1',
  'Rappel 2',
  'Td1',
  'Td2',
  'TdR',
] as const;

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

export default function NewVaccinationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [antigeneSelect, setAntigeneSelect] = useState('');
  const [antigeneAutre, setAntigeneAutre] = useState('');
  const [numeroDose, setNumeroDose] = useState('');
  const [voieAdministration, setVoieAdministration] = useState('');
  const [siteInjection, setSiteInjection] = useState('');
  const [numeroLot, setNumeroLot] = useState('');
  const [effetsSecondaires, setEffetsSecondaires] = useState('');
  const [dejaSousContraception, setDejaSousContraception] = useState(false);
  const [methodeContraceptivePrecedente, setMethodeContraceptivePrecedente] = useState('');
  const [pfppCounselingPropose, setPfppCounselingPropose] = useState(false);
  const [methodePfAdoptee, setMethodePfAdoptee] = useState('');
  const [conseilsAme, setConseilsAme] = useState('');
  const [pratiqueAme, setPratiqueAme] = useState('');
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

    const antigene = antigeneSelect === 'Autre' ? antigeneAutre.trim() : antigeneSelect;

    const body = {
      antigene,
      ...(numeroDose ? { numeroDose: Number(numeroDose) } : {}),
      ...(voieAdministration ? { voieAdministration } : {}),
      ...(siteInjection ? { siteInjection } : {}),
      ...(numeroLot ? { numeroLot } : {}),
      ...(effetsSecondaires ? { effetsSecondaires } : {}),
      dejaSousContraception,
      ...(dejaSousContraception && methodeContraceptivePrecedente
        ? { methodeContraceptivePrecedente }
        : {}),
      pfppCounselingPropose,
      ...(methodePfAdoptee ? { methodePfAdoptee } : {}),
      ...(conseilsAme ? { conseilsAme } : {}),
      ...(pratiqueAme ? { pratiqueAme } : {}),
      ...(prochainRdv ? { prochainRdv } : {}),
      ...(observations ? { observations } : {}),
    };

    const url = `/api/patients/${params.id}/vaccination`;

    // Already known to be offline — queue immediately rather than letting a
    // doomed request time out first.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueMutation({ url, body, resourceLabel: 'Vaccination' });
      toast('Enregistré hors-ligne — sera synchronisé automatiquement.');
      router.push(`/patients/${params.id}`);
      setSubmitting(false);
      return;
    }

    try {
      await api(url, { method: 'POST', body });
      toast('Vaccination enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      // status === 0 is api.ts's own signal for a network-layer failure
      // (request never reached the server) — treat it as a dropped
      // connection mid-submit, not a validation/business rejection.
      if (err instanceof ApiError && err.status === 0) {
        await queueMutation({ url, body, resourceLabel: 'Vaccination' });
        toast('Enregistré hors-ligne — sera synchronisé automatiquement.');
        router.push(`/patients/${params.id}`);
        setSubmitting(false);
        return;
      }
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre de vaccination de ce mois est déjà clôturé — impossible d’ajouter une dose.'
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
          / Nouvelle vaccination
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Nouvelle vaccination</h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-vaccination-form"
              disabled={submitting || (antigeneSelect === 'Autre' && !antigeneAutre.trim())}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer la dose'}
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

        <form id="new-vaccination-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Vaccin administré</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Antigène" required>
                <select
                  className={inputClass}
                  value={antigeneSelect}
                  onChange={(e) => setAntigeneSelect(e.target.value)}
                  required
                >
                  <option value="">Sélectionner</option>
                  {ANTIGENES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  <option value="Autre">Autre…</option>
                </select>
              </Field>
              {antigeneSelect === 'Autre' && (
                <Field label="Préciser l'antigène" required>
                  <input
                    className={inputClass}
                    value={antigeneAutre}
                    onChange={(e) => setAntigeneAutre(e.target.value)}
                    required
                  />
                </Field>
              )}
              <Field label="N° de dose">
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={numeroDose}
                  onChange={(e) => setNumeroDose(e.target.value)}
                />
              </Field>
              <Field label="Voie d'administration">
                <select
                  className={inputClass}
                  value={voieAdministration}
                  onChange={(e) => setVoieAdministration(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Orale">Orale</option>
                  <option value="Intramusculaire">Intramusculaire</option>
                  <option value="Sous-cutanée">Sous-cutanée</option>
                  <option value="Intradermique">Intradermique</option>
                </select>
              </Field>
              <Field label="Site d'injection">
                <select
                  className={inputClass}
                  value={siteInjection}
                  onChange={(e) => setSiteInjection(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Bras droit">Bras droit</option>
                  <option value="Bras gauche">Bras gauche</option>
                  <option value="Cuisse droite">Cuisse droite</option>
                  <option value="Cuisse gauche">Cuisse gauche</option>
                  <option value="Bouche">Bouche</option>
                </select>
              </Field>
              <Field label="N° de lot">
                <input
                  className={inputClass}
                  value={numeroLot}
                  onChange={(e) => setNumeroLot(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Suivi</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Effets secondaires">
                <input
                  className={inputClass}
                  value={effetsSecondaires}
                  onChange={(e) => setEffetsSecondaires(e.target.value)}
                />
              </Field>
              <Field label="Prochain rendez-vous">
                <input
                  type="date"
                  className={inputClass}
                  value={prochainRdv}
                  onChange={(e) => setProchainRdv(e.target.value)}
                />
              </Field>
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

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">
              Planification familiale du post-partum (PFPP) et AME
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={dejaSousContraception}
                  onChange={(e) => setDejaSousContraception(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Femme déjà sous une méthode contraceptive
              </label>
              {dejaSousContraception && (
                <Field label="Méthode contraceptive précédente">
                  <input
                    className={inputClass}
                    value={methodeContraceptivePrecedente}
                    onChange={(e) => setMethodeContraceptivePrecedente(e.target.value)}
                  />
                </Field>
              )}
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={pfppCounselingPropose}
                  onChange={(e) => setPfppCounselingPropose(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Counseling PF/PFPP proposé lors de cette visite
              </label>
              <Field label="Méthode moderne de PF adoptée">
                <input
                  className={inputClass}
                  value={methodePfAdoptee}
                  onChange={(e) => setMethodePfAdoptee(e.target.value)}
                />
              </Field>
              <Field label="Conseils donnés sur l'AME">
                <select
                  className={inputClass}
                  value={conseilsAme}
                  onChange={(e) => setConseilsAme(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="O">Oui</option>
                  <option value="N">Non</option>
                  <option value="NA">Non applicable</option>
                </select>
              </Field>
              <Field label="Pratique de l'AME">
                <select
                  className={inputClass}
                  value={pratiqueAme}
                  onChange={(e) => setPratiqueAme(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="O">Oui</option>
                  <option value="N">Non</option>
                  <option value="NA">Non applicable</option>
                </select>
              </Field>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
