'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { queueMutation } from '@/lib/offlineQueue';
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

// Registre de consultation PF officiel : le tableau méthode × action —
// chaque méthode a ses propres colonnes d'action possibles.
const METHODES = [
  'DIU',
  'Pilule COC',
  'Pilule COP',
  'Jadelle',
  'Implanon',
  'DMPA-IM',
  'DMPA-SC',
  'MAMA',
  'Collier',
  'CCV',
  'Condom masculin',
  'Condom féminin',
  'Autre',
] as const;

const ACTIONS_BY_METHODE: Record<string, readonly string[]> = {
  DIU: [
    'Per Césarienne',
    'Post placentaire',
    'PPI 48H',
    'Insertion',
    'Réinsertion',
    'Retrait',
    'Suivi/Contrôle',
  ],
  'Pilule COC': ['1ère dotation', 'Renouvellement', 'Suivi/Contrôle'],
  'Pilule COP': ['1ère dotation', 'Renouvellement', 'PPI 48H', 'Suivi/Contrôle'],
  Jadelle: ['Insertion', 'PPI 48H', 'Retrait', 'Suivi/Contrôle'],
  Implanon: ['Insertion', 'PPI 48H', 'Retrait', 'Suivi/Contrôle'],
  'DMPA-IM': ['1ère injection', 'Renouvellement', 'Suivi/Contrôle'],
  'DMPA-SC': ['1ère injection', 'Auto-injection', 'Renouvellement', 'Suivi/Contrôle'],
  MAMA: ['Pratique'],
  Collier: ['Dotation'],
  CCV: ['Pratique (per césarienne)', 'Pratique (en dehors césarienne)'],
};

export default function NewPlanificationFamilialePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [typeVisite, setTypeVisite] = useState('');
  const [methodeChoisie, setMethodeChoisie] = useState('');
  const [actionMethode, setActionMethode] = useState('');
  const [nbreCyclesDistribues, setNbreCyclesDistribues] = useState('');
  const [methodePrecedente, setMethodePrecedente] = useState('');
  const [parite, setParite] = useState('');
  const [gestite, setGestite] = useState('');
  const [tensionArterielle, setTensionArterielle] = useState('');
  const [poidsKg, setPoidsKg] = useState('');
  const [counselingDonne, setCounselingDonne] = useState(false);
  const [effetsSecondairesRapportes, setEffetsSecondairesRapportes] = useState('');
  const [quantiteRemise, setQuantiteRemise] = useState('');
  const [typeUtilisateur, setTypeUtilisateur] = useState('');
  const [ageDernierEnfantMois, setAgeDernierEnfantMois] = useState('');
  const [pratiqueAme, setPratiqueAme] = useState('');
  const [enfantAJourVaccins, setEnfantAJourVaccins] = useState('');
  const [conseilsAlimentationComplement, setConseilsAlimentationComplement] = useState('');
  const [serviceProvenance, setServiceProvenance] = useState('');
  const [ppi, setPpi] = useState(false);
  const [prochainRdv, setProchainRdv] = useState('');
  const [observations, setObservations] = useState('');

  const actionsDisponibles = ACTIONS_BY_METHODE[methodeChoisie] ?? [];
  const showNbreCycles = methodeChoisie === 'Pilule COC' || methodeChoisie === 'Pilule COP';

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
      typeVisite,
      methodeChoisie,
      ...(actionMethode ? { actionMethode } : {}),
      ...(showNbreCycles && nbreCyclesDistribues
        ? { nbreCyclesDistribues: Number(nbreCyclesDistribues) }
        : {}),
      ...(methodePrecedente ? { methodePrecedente } : {}),
      ...(parite ? { parite: Number(parite) } : {}),
      ...(gestite ? { gestite: Number(gestite) } : {}),
      ...(tensionArterielle ? { tensionArterielle } : {}),
      ...(poidsKg ? { poidsKg: Number(poidsKg) } : {}),
      counselingDonne,
      ...(effetsSecondairesRapportes ? { effetsSecondairesRapportes } : {}),
      ...(quantiteRemise ? { quantiteRemise } : {}),
      ...(typeUtilisateur ? { typeUtilisateur } : {}),
      ...(ageDernierEnfantMois ? { ageDernierEnfantMois: Number(ageDernierEnfantMois) } : {}),
      ...(pratiqueAme ? { pratiqueAme } : {}),
      ...(enfantAJourVaccins ? { enfantAJourVaccins } : {}),
      ...(conseilsAlimentationComplement ? { conseilsAlimentationComplement } : {}),
      ...(serviceProvenance ? { serviceProvenance } : {}),
      ppi,
      ...(prochainRdv ? { prochainRdv } : {}),
      ...(observations ? { observations } : {}),
    };

    const url = `/api/patients/${params.id}/planification-familiale`;

    // Already known to be offline — queue immediately rather than letting a
    // doomed request time out first.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueMutation({ url, body, resourceLabel: 'Visite PF' });
      toast('Enregistré hors-ligne — sera synchronisé automatiquement.');
      router.push(`/patients/${params.id}`);
      setSubmitting(false);
      return;
    }

    try {
      await api(url, { method: 'POST', body });
      toast('Visite PF enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      // status === 0 is api.ts's own signal for a network-layer failure
      // (request never reached the server) — treat it as a dropped
      // connection mid-submit, not a validation/business rejection.
      if (err instanceof ApiError && err.status === 0) {
        await queueMutation({ url, body, resourceLabel: 'Visite PF' });
        toast('Enregistré hors-ligne — sera synchronisé automatiquement.');
        router.push(`/patients/${params.id}`);
        setSubmitting(false);
        return;
      }
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre de planification familiale de ce mois est déjà clôturé — impossible d’ajouter une visite.'
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
          / Nouvelle visite PF
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">
            Nouvelle visite de planification familiale
          </h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-pf-form"
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

        <form id="new-pf-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Visite</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Type de visite" required>
                <select
                  className={inputClass}
                  value={typeVisite}
                  onChange={(e) => setTypeVisite(e.target.value)}
                  required
                >
                  <option value="">Sélectionner</option>
                  <option value="Nouvelle acceptante">Nouvelle acceptante</option>
                  <option value="Cliente continuante">Cliente continuante</option>
                  <option value="Changement de méthode">Changement de méthode</option>
                  <option value="Retrait/Abandon">Retrait/Abandon</option>
                </select>
              </Field>
              <Field label="Méthode choisie" required>
                <select
                  className={inputClass}
                  value={methodeChoisie}
                  onChange={(e) => {
                    setMethodeChoisie(e.target.value);
                    setActionMethode('');
                  }}
                  required
                >
                  <option value="">Sélectionner</option>
                  {METHODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              {actionsDisponibles.length > 0 && (
                <Field label="Action">
                  <select
                    className={inputClass}
                    value={actionMethode}
                    onChange={(e) => setActionMethode(e.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {actionsDisponibles.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {showNbreCycles && (
                <Field label="Nbre de cycles distribués">
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={nbreCyclesDistribues}
                    onChange={(e) => setNbreCyclesDistribues(e.target.value)}
                  />
                </Field>
              )}
              {typeVisite === 'Changement de méthode' && (
                <Field label="Méthode précédente">
                  <input
                    className={inputClass}
                    value={methodePrecedente}
                    onChange={(e) => setMethodePrecedente(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Quantité remise">
                <input
                  className={inputClass}
                  placeholder="Ex: 3 plaquettes"
                  value={quantiteRemise}
                  onChange={(e) => setQuantiteRemise(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Utilisatrice et provenance</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Type d'utilisatrice">
                <select
                  className={inputClass}
                  value={typeUtilisateur}
                  onChange={(e) => setTypeUtilisateur(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Nouveau">Nouvelle</option>
                  <option value="Ancien">Ancienne</option>
                </select>
              </Field>
              <Field label="Âge du dernier enfant (mois)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={ageDernierEnfantMois}
                  onChange={(e) => setAgeDernierEnfantMois(e.target.value)}
                />
              </Field>
              <Field label="Service de provenance">
                <select
                  className={inputClass}
                  value={serviceProvenance}
                  onChange={(e) => setServiceProvenance(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="Accouchement">Accouchement</option>
                  <option value="CPoN">CPoN</option>
                  <option value="SPE">SPE</option>
                  <option value="Vaccination">Vaccination</option>
                  <option value="Post avortement">Post avortement</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b] sm:col-span-3">
                <input
                  type="checkbox"
                  checked={ppi}
                  onChange={(e) => setPpi(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Visite en post-partum immédiat (PPI, ≤ 48h)
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">
              Enfant : AME, vaccins et alimentation
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <Field label="Enfant à jour de ses vaccins">
                <select
                  className={inputClass}
                  value={enfantAJourVaccins}
                  onChange={(e) => setEnfantAJourVaccins(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="O">Oui</option>
                  <option value="N">Non</option>
                  <option value="NA">Non applicable</option>
                </select>
              </Field>
              <Field label="Conseils alimentation de complément">
                <select
                  className={inputClass}
                  value={conseilsAlimentationComplement}
                  onChange={(e) => setConseilsAlimentationComplement(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  <option value="O">Oui</option>
                  <option value="N">Non</option>
                  <option value="NA">Non applicable</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Antécédents et constantes</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Gestité">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={gestite}
                  onChange={(e) => setGestite(e.target.value)}
                />
              </Field>
              <Field label="Parité">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={parite}
                  onChange={(e) => setParite(e.target.value)}
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
              <Field label="Tension artérielle">
                <input
                  className={inputClass}
                  placeholder="118/76"
                  value={tensionArterielle}
                  onChange={(e) => setTensionArterielle(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Counseling et suivi</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={counselingDonne}
                  onChange={(e) => setCounselingDonne(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Counseling donné
              </label>
              <Field label="Effets secondaires rapportés">
                <input
                  className={inputClass}
                  value={effetsSecondairesRapportes}
                  onChange={(e) => setEffetsSecondairesRapportes(e.target.value)}
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
        </form>
      </div>
    </main>
  );
}
