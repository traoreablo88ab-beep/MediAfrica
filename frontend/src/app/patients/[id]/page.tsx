'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface ConsultationDetail {
  id: string;
  date: string;
  motif: string;
  status: string;
  diagnostic: string | null;
  traitementPrescrit: string | null;
  tensionArterielle: string | null;
  poidsKg: number | null;
  tailleCm: number | null;
  perimetreBrachialCm: number | null;
  statutPT: string | null;
  temperatureC: number | null;
  typeCas: string | null;
  mdo: boolean;
  mdoMaladie: string | null;
  tdr: string | null;
  ge: string | null;
  indigent: boolean | null;
  telephoneContact: string | null;
  localisationPrecise: string | null;
  providerName: string | null;
}

interface MaterniteDetail {
  id: string;
  date: string;
  type: string;
  cpnNumeroVisite: number | null;
  ageGestationnelSemaines: number | null;
  prochainRdv: string | null;
  modeAccouchement: string | null;
  issueGrossesse: string | null;
  sexeNouveauNe: string | null;
  poidsNaissanceG: number | null;
  observations: string | null;
  indigent: boolean | null;
  telephoneContact: string | null;
  localisationPrecise: string | null;
  providerName: string | null;
}

interface NutritionVisiteSuiviDetail {
  id: string;
  numeroVisite: number;
  date: string;
  poidsKg: number | null;
  tailleCm: number | null;
  perimetreBrachialCm: number | null;
  ptIndice: string | null;
  oedemes: string | null;
  type: string | null;
  testAppetit: string | null;
  diarrheeJours: number | null;
  vomissementJours: number | null;
  fievreJours: number | null;
  touxJours: number | null;
  temperatureC: number | null;
  resultatTestPalu: string | null;
  atpeSachets: number | null;
  dermatoses: string | null;
  alerteLethargique: string | null;
  frequenceRespiratoireMin: number | null;
  seancesEducationNutritionnelle: number | null;
  seancesStimulation: number | null;
  observations: string | null;
}

interface NutritionEvenementDetail {
  id: string;
  type: string;
  date: string;
  raison: string | null;
  conclusion: string | null;
  centre: string | null;
  resultat: string | null;
}

interface NutritionDetail {
  id: string;
  date: string;
  type: string;
  numeroMas: string | null;
  telephoneContact: string | null;
  localisationPrecise: string | null;
  ageMois: number | null;
  modeAdmission: string | null;
  typeCas: string | null;
  poidsKg: number | null;
  tailleCm: number | null;
  perimetreBrachialCm: number | null;
  ptIndice: string | null;
  oedemes: string | null;
  pathologiesAssociees: string | null;
  nomPere: string | null;
  nomMere: string | null;
  allaite: boolean | null;
  jumeaux: boolean | null;
  parentsVivants: boolean | null;
  sourceAdmission: string | null;
  carteVaccination: boolean | null;
  vaccinationAJour: boolean | null;
  dateSortie: string | null;
  poidsSortieKg: number | null;
  tailleSortieCm: number | null;
  perimetreBrachialSortieCm: number | null;
  ptIndiceSortie: string | null;
  oedemeSortie: string | null;
  typeSortie: string | null;
  datePoidsMinimum: string | null;
  poidsMinimumKg: number | null;
  seancesStimulationPsychocognitive: number | null;
  seancesCcsc: number | null;
  beneficiairePoudreNutritive: boolean | null;
  beneficiairePlaquette: boolean | null;
  dureeSejourJours: number | null;
  observations: string | null;
  visites: NutritionVisiteSuiviDetail[];
  evenements: NutritionEvenementDetail[];
  providerName: string | null;
}

interface VaccinationDetail {
  id: string;
  date: string;
  antigene: string;
  numeroDose: number | null;
  siteInjection: string | null;
  dejaSousContraception: boolean | null;
  methodeContraceptivePrecedente: string | null;
  pfppCounselingPropose: boolean | null;
  methodePfAdoptee: string | null;
  conseilsAme: string | null;
  pratiqueAme: string | null;
  prochainRdv: string | null;
  observations: string | null;
  providerName: string | null;
}

interface HospitalisationDetail {
  id: string;
  dateHeureEntree: string;
  motifAdmission: string;
  service: string | null;
  numeroHospitalisation: string | null;
  referenceOrigine: string | null;
  profession: string | null;
  indigent: boolean | null;
  telephoneContact: string | null;
  localisationPrecise: string | null;
  diagnosticPrincipal: string | null;
  traitementRecu: string | null;
  dateHeureSortie: string | null;
  issue: string | null;
  observations: string | null;
  providerName: string | null;
}

interface PlanificationFamilialeDetail {
  id: string;
  date: string;
  typeVisite: string;
  methodeChoisie: string;
  actionMethode: string | null;
  nbreCyclesDistribues: number | null;
  typeUtilisateur: string | null;
  ageDernierEnfantMois: number | null;
  pratiqueAme: string | null;
  enfantAJourVaccins: string | null;
  conseilsAlimentationComplement: string | null;
  serviceProvenance: string | null;
  ppi: boolean | null;
  prochainRdv: string | null;
  observations: string | null;
  providerName: string | null;
}

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
  contactUrgenceTelephone: string | null;
  numeroRamed: string | null;
  numeroAmo: string | null;
  groupeSanguin: string | null;
  allergiesConnues: string | null;
  antecedentsPersonnels: string | null;
  antecedentsChirurgicaux: string | null;
  antecedentsFamiliaux: string | null;
  consultations: ConsultationDetail[];
  maternites: MaterniteDetail[];
  nutritions: NutritionDetail[];
  vaccinations: VaccinationDetail[];
  hospitalisations: HospitalisationDetail[];
  planificationsFamiliales: PlanificationFamilialeDetail[];
}

const MATERNITE_TYPE_LABEL: Record<string, string> = {
  CPN: 'CPN',
  ACCOUCHEMENT: 'Accouchement',
};

const NUTRITION_TYPE_LABEL: Record<string, string> = {
  URENI: 'URENI',
  URENAS: 'URENAS',
  URENAM: 'URENAM',
};

const VISIT_NUMBER_LABEL: Record<string, string> = {
  URENI: 'Jour',
  URENAS: 'Semaine',
  URENAM: 'Visite',
};

function computeAge(dateNaissanceIso: string): number {
  const dob = new Date(dateNaissanceIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#e1e0d9] px-5 py-3 last:border-0">
      <p className="text-xs uppercase tracking-wide text-[#898781]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[#0b0b0b]">{value}</p>
    </div>
  );
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api<PatientDetail>(`/api/patients/${params.id}`);
        if (!cancelled) setPatient(data);
      } catch (err) {
        if (!cancelled) {
          setError(
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

  async function onDeleteConsultation(consultationId: string) {
    if (
      !window.confirm(
        'Annuler cette consultation ? Cette action est définitive et supprimera l’entrée du registre.',
      )
    ) {
      return;
    }
    setDeletingId(consultationId);
    try {
      await api(`/api/consultations/${consultationId}`, { method: 'DELETE' });
      setPatient((p) =>
        p ? { ...p, consultations: p.consultations.filter((c) => c.id !== consultationId) } : p,
      );
      toast('Consultation supprimée.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="patients" />
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Skeleton className="mb-4 h-4 w-40" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white">
                <div className="bg-[#e1e0d9]/40 px-5 py-4">
                  <Skeleton className="h-5 w-32 bg-white/50" />
                  <Skeleton className="mt-2 h-4 w-24 bg-white/40" />
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border-b border-[#e1e0d9] px-5 py-3 last:border-0">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-2 h-4 w-32" />
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-6 rounded-lg border border-[#e1e0d9] bg-white p-5">
                <Skeleton className="mb-4 h-5 w-48" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="mt-2 h-4 w-full" />
                    </div>
                  ))}
                </div>
              </div>
              <Skeleton className="mb-4 h-5 w-56" />
              <div className="flex flex-col gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !patient) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="patients" />
        <div className="flex min-h-[calc(100vh-61px)] items-center justify-center px-6">
          <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            {error ?? 'Patient introuvable.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="patients" />
      </div>
      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781] print:hidden">
          <Link href="/patients" className="hover:underline">
            Patients
          </Link>{' '}
          / {patient.nom}, {patient.prenom}
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white">
              <div className="bg-[#2a78d6] px-5 py-4 text-white">
                <p className="text-lg font-bold">
                  {patient.nom}, {patient.prenom}
                </p>
                <p className="text-sm text-white/80">{patient.dossierNumber}</p>
              </div>
              <Field
                label="Date de naissance"
                value={`${formatDate(patient.dateNaissance)} (${computeAge(patient.dateNaissance)} ans)`}
              />
              <Field label="Sexe" value={patient.sexe === 'F' ? 'Féminin' : 'Masculin'} />
              <Field label="Commune" value={patient.communeResidence} />
              <Field label="Téléphone" value={patient.telephonePrincipal} />
              {patient.contactUrgenceNom && (
                <Field
                  label="Contact urgence"
                  value={`${patient.contactUrgenceNom}${patient.contactUrgenceTelephone ? ' · ' + patient.contactUrgenceTelephone : ''}`}
                />
              )}
              {patient.groupeSanguin && (
                <Field label="Groupe sanguin" value={patient.groupeSanguin} />
              )}
              {patient.allergiesConnues && (
                <Field label="Allergies connues" value={patient.allergiesConnues} />
              )}
              {patient.numeroRamed && <Field label="N° RAMED" value={patient.numeroRamed} />}
              {patient.numeroAmo && <Field label="N° AMO" value={patient.numeroAmo} />}
            </div>

            <div className="mt-4 flex flex-col gap-2 print:hidden">
              <Link
                href={`/patients/${patient.id}/consultations/new`}
                className="rounded-md bg-[#2a78d6] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#256abf]"
              >
                + Nouvelle consultation
              </Link>
              <Link
                href={`/patients/${patient.id}/maternite/new`}
                className="rounded-md border border-[#2a78d6] bg-white px-4 py-2.5 text-center text-sm font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5"
              >
                + Nouvelle fiche maternité
              </Link>
              <Link
                href={`/patients/${patient.id}/nutrition/new`}
                className="rounded-md border border-[#2a78d6] bg-white px-4 py-2.5 text-center text-sm font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5"
              >
                + Nouvelle fiche nutrition
              </Link>
              <Link
                href={`/patients/${patient.id}/vaccination/new`}
                className="rounded-md border border-[#2a78d6] bg-white px-4 py-2.5 text-center text-sm font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5"
              >
                + Nouvelle vaccination
              </Link>
              <Link
                href={`/patients/${patient.id}/hospitalisation/new`}
                className="rounded-md border border-[#2a78d6] bg-white px-4 py-2.5 text-center text-sm font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5"
              >
                + Nouvelle admission
              </Link>
              <Link
                href={`/patients/${patient.id}/planification-familiale/new`}
                className="rounded-md border border-[#2a78d6] bg-white px-4 py-2.5 text-center text-sm font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5"
              >
                + Nouvelle visite PF
              </Link>
              <Link
                href={`/patients/${patient.id}/edit`}
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2.5 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Modifier le dossier
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2.5 text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
              >
                Imprimer la fiche
              </button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="mb-6 rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-4 font-semibold text-[#0b0b0b]">Antécédents médicaux</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#898781]">Personnels</p>
                  <p className="mt-1 text-sm text-[#0b0b0b]">
                    {patient.antecedentsPersonnels || 'Aucun renseigné'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#898781]">Chirurgicaux</p>
                  <p className="mt-1 text-sm text-[#0b0b0b]">
                    {patient.antecedentsChirurgicaux || 'Aucun renseigné'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#898781]">Familiaux</p>
                  <p className="mt-1 text-sm text-[#0b0b0b]">
                    {patient.antecedentsFamiliaux || 'Aucun renseigné'}
                  </p>
                </div>
              </div>
            </div>

            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Historique des consultations</h2>
            {patient.consultations.length === 0 ? (
              <p className="text-sm text-[#898781]">Aucune consultation enregistrée.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {patient.consultations.map((c) => (
                  <div
                    key={c.id}
                    className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-5 py-3">
                      <div>
                        <span className="text-sm font-semibold text-[#0b0b0b]">
                          {formatDate(c.date)}
                        </span>{' '}
                        <span className="text-sm text-[#52514e]">{c.motif}</span>
                        {c.typeCas && (
                          <span className="ml-2 rounded-full bg-[#e1e0d9] px-2 py-0.5 text-xs font-medium text-[#52514e]">
                            {c.typeCas}
                          </span>
                        )}
                        {c.mdo && (
                          <span className="ml-2 rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-xs font-medium text-[#d03b3b]">
                            MDO{c.mdoMaladie ? ` — ${c.mdoMaladie}` : ''}
                          </span>
                        )}
                        {c.indigent && (
                          <span className="ml-2 rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-xs font-medium text-[#d03b3b]">
                            Indigent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {c.providerName && (
                          <span className="text-xs text-[#898781]">{c.providerName}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteConsultation(c.id)}
                          disabled={deletingId === c.id}
                          className="print:hidden text-xs font-medium text-[#d03b3b] hover:underline disabled:opacity-50"
                        >
                          {deletingId === c.id ? 'Suppression…' : 'Annuler'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-[#898781]">Diagnostic</p>
                        <p className="mt-0.5 text-sm text-[#0b0b0b]">{c.diagnostic || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-[#898781]">
                          Traitement prescrit
                        </p>
                        <p className="mt-0.5 text-sm text-[#0b0b0b]">
                          {c.traitementPrescrit || '—'}
                        </p>
                      </div>
                    </div>
                    {(c.tensionArterielle ||
                      c.poidsKg ||
                      c.tailleCm ||
                      c.perimetreBrachialCm ||
                      c.statutPT ||
                      c.temperatureC ||
                      c.tdr ||
                      c.ge ||
                      c.telephoneContact ||
                      c.localisationPrecise) && (
                      <div className="flex flex-wrap gap-6 border-t border-[#e1e0d9] px-5 py-3 text-sm text-[#52514e]">
                        {c.tensionArterielle && (
                          <span>
                            TA{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {c.tensionArterielle}
                            </span>
                          </span>
                        )}
                        {c.poidsKg && (
                          <span>
                            Poids{' '}
                            <span className="font-semibold text-[#0b0b0b]">{c.poidsKg} kg</span>
                          </span>
                        )}
                        {c.tailleCm && (
                          <span>
                            Taille{' '}
                            <span className="font-semibold text-[#0b0b0b]">{c.tailleCm} cm</span>
                          </span>
                        )}
                        {c.perimetreBrachialCm && (
                          <span>
                            PB{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {c.perimetreBrachialCm} cm
                            </span>
                          </span>
                        )}
                        {c.statutPT && (
                          <span>
                            P/T <span className="font-semibold text-[#0b0b0b]">{c.statutPT}</span>
                          </span>
                        )}
                        {c.temperatureC && (
                          <span>
                            Temp.{' '}
                            <span className="font-semibold text-[#0b0b0b]">{c.temperatureC}°C</span>
                          </span>
                        )}
                        {c.tdr && (
                          <span>
                            TDR <span className="font-semibold text-[#0b0b0b]">{c.tdr}</span>
                          </span>
                        )}
                        {c.ge && (
                          <span>
                            GE <span className="font-semibold text-[#0b0b0b]">{c.ge}</span>
                          </span>
                        )}
                        {c.telephoneContact && (
                          <span>
                            Téléphone{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {c.telephoneContact}
                            </span>
                          </span>
                        )}
                        {c.localisationPrecise && (
                          <span>
                            Localisation{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {c.localisationPrecise}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h2 className="mb-4 mt-8 font-semibold text-[#0b0b0b]">Historique de maternité</h2>
            {patient.maternites.length === 0 ? (
              <p className="text-sm text-[#898781]">Aucune fiche de maternité enregistrée.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {patient.maternites.map((m) => (
                  <div
                    key={m.id}
                    className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-5 py-3">
                      <div>
                        <span className="text-sm font-semibold text-[#0b0b0b]">
                          {formatDate(m.date)}
                        </span>{' '}
                        <span className="ml-2 rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                          {MATERNITE_TYPE_LABEL[m.type] ?? m.type}
                        </span>
                        {m.indigent && (
                          <span className="ml-2 rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-xs font-medium text-[#d03b3b]">
                            Indigente
                          </span>
                        )}
                      </div>
                      {m.providerName && (
                        <span className="text-xs text-[#898781]">{m.providerName}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-[#52514e]">
                      {m.type === 'CPN' && (
                        <>
                          {m.cpnNumeroVisite != null && (
                            <span>
                              Visite{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                N°{m.cpnNumeroVisite}
                              </span>
                            </span>
                          )}
                          {m.ageGestationnelSemaines != null && (
                            <span>
                              Âge gestationnel{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                {m.ageGestationnelSemaines} SA
                              </span>
                            </span>
                          )}
                          {m.prochainRdv && (
                            <span>
                              Prochain RDV{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                {formatDate(m.prochainRdv)}
                              </span>
                            </span>
                          )}
                        </>
                      )}
                      {m.type === 'ACCOUCHEMENT' && (
                        <>
                          {m.modeAccouchement && (
                            <span>
                              Mode{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                {m.modeAccouchement}
                              </span>
                            </span>
                          )}
                          {m.issueGrossesse && (
                            <span>
                              Issue{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                {m.issueGrossesse}
                              </span>
                            </span>
                          )}
                          {m.sexeNouveauNe && (
                            <span>
                              Sexe{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                {m.sexeNouveauNe === 'M' ? 'Masculin' : 'Féminin'}
                              </span>
                            </span>
                          )}
                          {m.poidsNaissanceG != null && (
                            <span>
                              Poids{' '}
                              <span className="font-semibold text-[#0b0b0b]">
                                {m.poidsNaissanceG} g
                              </span>
                            </span>
                          )}
                        </>
                      )}
                      {m.telephoneContact && (
                        <span>
                          Téléphone{' '}
                          <span className="font-semibold text-[#0b0b0b]">{m.telephoneContact}</span>
                        </span>
                      )}
                      {m.localisationPrecise && (
                        <span>
                          Localisation{' '}
                          <span className="font-semibold text-[#0b0b0b]">
                            {m.localisationPrecise}
                          </span>
                        </span>
                      )}
                      {!m.cpnNumeroVisite &&
                        !m.ageGestationnelSemaines &&
                        !m.prochainRdv &&
                        !m.modeAccouchement &&
                        !m.issueGrossesse &&
                        !m.sexeNouveauNe &&
                        m.poidsNaissanceG == null &&
                        !m.telephoneContact &&
                        !m.localisationPrecise && <span>—</span>}
                    </div>
                    {m.observations && (
                      <div className="border-t border-[#e1e0d9] px-5 py-3">
                        <p className="text-xs uppercase tracking-wide text-[#898781]">
                          Observations
                        </p>
                        <p className="mt-0.5 text-sm text-[#0b0b0b]">{m.observations}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h2 className="mb-4 mt-8 font-semibold text-[#0b0b0b]">Historique nutrition (PCIMA)</h2>
            {patient.nutritions.length === 0 ? (
              <p className="text-sm text-[#898781]">Aucune fiche PCIMA enregistrée.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {patient.nutritions.map((n) => {
                  const isUrenam = n.type === 'URENAM';
                  const isUrenas = n.type === 'URENAS';
                  const closed = isUrenam ? n.typeSortie != null : n.dateSortie != null;
                  return (
                    <div
                      key={n.id}
                      className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white"
                    >
                      <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-5 py-3">
                        <div>
                          <span className="text-sm font-semibold text-[#0b0b0b]">
                            {formatDate(n.date)}
                          </span>{' '}
                          <span className="ml-2 rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                            {NUTRITION_TYPE_LABEL[n.type] ?? n.type}
                          </span>
                          {closed ? (
                            <span className="ml-2 rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                              {isUrenam
                                ? (n.typeSortie ?? 'Clôturé')
                                : `Sorti le ${n.dateSortie ? formatDate(n.dateSortie) : ''}`}
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full bg-[#d08a1c]/10 px-2 py-0.5 text-xs font-medium text-[#d08a1c]">
                              En cours
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {n.providerName && (
                            <span className="text-xs text-[#898781]">{n.providerName}</span>
                          )}
                          {!closed && (
                            <Link
                              href={`/patients/${patient.id}/nutrition/${n.id}/visite`}
                              className="print:hidden text-xs font-medium text-[#2a78d6] hover:underline"
                            >
                              + Ajouter une visite
                            </Link>
                          )}
                          {!closed && isUrenas && (
                            <Link
                              href={`/patients/${patient.id}/nutrition/${n.id}/evenement`}
                              className="print:hidden text-xs font-medium text-[#2a78d6] hover:underline"
                            >
                              + VAD / transfert
                            </Link>
                          )}
                          {!closed && (
                            <Link
                              href={`/patients/${patient.id}/nutrition/${n.id}/sortie`}
                              className="print:hidden text-xs font-medium text-[#2a78d6] hover:underline"
                            >
                              {isUrenam ? 'Clôturer l’épisode →' : 'Enregistrer la sortie →'}
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-[#52514e]">
                        {n.numeroMas && (
                          <span>
                            N° MAS{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.numeroMas}</span>
                          </span>
                        )}
                        {n.ageMois != null && (
                          <span>
                            Âge{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.ageMois} mois</span>
                          </span>
                        )}
                        {!isUrenam && n.modeAdmission && (
                          <span>
                            Mode admission{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.modeAdmission}</span>
                          </span>
                        )}
                        {isUrenam && n.typeCas && (
                          <span>
                            Type de cas{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.typeCas}</span>
                          </span>
                        )}
                        {n.poidsKg != null && (
                          <span>
                            Poids{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.poidsKg} kg</span>
                          </span>
                        )}
                        {n.tailleCm != null && (
                          <span>
                            Taille{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.tailleCm} cm</span>
                          </span>
                        )}
                        {n.perimetreBrachialCm != null && (
                          <span>
                            PB{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {n.perimetreBrachialCm} cm
                            </span>
                          </span>
                        )}
                        {n.ptIndice && (
                          <span>
                            {n.type === 'URENI' ? 'P/T ou IMC' : 'P/T Z'}{' '}
                            <span className="font-semibold text-[#0b0b0b]">{n.ptIndice}</span>
                          </span>
                        )}
                        {n.oedemes && (
                          <span>
                            Œdèmes <span className="font-semibold text-[#0b0b0b]">{n.oedemes}</span>
                          </span>
                        )}
                        {n.telephoneContact && (
                          <span>
                            Téléphone{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {n.telephoneContact}
                            </span>
                          </span>
                        )}
                        {n.localisationPrecise && (
                          <span>
                            Localisation{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {n.localisationPrecise}
                            </span>
                          </span>
                        )}
                      </div>
                      {n.pathologiesAssociees && (
                        <div className="border-t border-[#e1e0d9] px-5 py-3">
                          <p className="text-xs uppercase tracking-wide text-[#898781]">
                            Pathologies associées
                          </p>
                          <p className="mt-0.5 text-sm text-[#0b0b0b]">{n.pathologiesAssociees}</p>
                        </div>
                      )}
                      {n.visites.length > 0 && (
                        <div className="border-t border-[#e1e0d9] px-5 py-3">
                          <p className="mb-2 text-xs uppercase tracking-wide text-[#898781]">
                            Visites de suivi
                          </p>
                          <div className="flex flex-col gap-2">
                            {n.visites.map((v) => (
                              <div
                                key={v.id}
                                className="flex flex-wrap items-center gap-4 rounded-md bg-[#f9f9f7] px-3 py-2 text-sm text-[#52514e]"
                              >
                                <span className="font-semibold text-[#0b0b0b]">
                                  {VISIT_NUMBER_LABEL[n.type] ?? 'Visite'} {v.numeroVisite}
                                </span>
                                <span>{formatDate(v.date)}</span>
                                {v.poidsKg != null && <span>Poids {v.poidsKg} kg</span>}
                                {v.perimetreBrachialCm != null && (
                                  <span>PB {v.perimetreBrachialCm} cm</span>
                                )}
                                {v.ptIndice && <span>P/T Z {v.ptIndice}</span>}
                                {v.oedemes && <span>Œd. {v.oedemes}</span>}
                                {v.testAppetit && <span>Appétit {v.testAppetit}</span>}
                                {v.temperatureC != null && <span>Temp. {v.temperatureC}°C</span>}
                                {v.type && <span>{v.type}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {isUrenas && n.evenements.length > 0 && (
                        <div className="border-t border-[#e1e0d9] px-5 py-3">
                          <p className="mb-2 text-xs uppercase tracking-wide text-[#898781]">
                            VAD / références / transferts
                          </p>
                          <div className="flex flex-col gap-2">
                            {n.evenements.map((ev) => (
                              <div
                                key={ev.id}
                                className="flex flex-wrap items-center gap-4 rounded-md bg-[#f9f9f7] px-3 py-2 text-sm text-[#52514e]"
                              >
                                <span className="font-semibold text-[#0b0b0b]">
                                  {ev.type === 'VAD' ? 'VAD' : 'Référence/transfert'}
                                </span>
                                <span>{formatDate(ev.date)}</span>
                                {ev.raison && <span>Raison {ev.raison}</span>}
                                {ev.conclusion && <span>Conclusion {ev.conclusion}</span>}
                                {ev.centre && <span>Centre {ev.centre}</span>}
                                {ev.resultat && <span>Résultat {ev.resultat}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!isUrenam &&
                        (n.typeSortie ||
                          n.poidsSortieKg != null ||
                          n.poidsMinimumKg != null ||
                          n.seancesStimulationPsychocognitive != null ||
                          n.seancesCcsc != null) && (
                          <div className="flex flex-wrap gap-6 border-t border-[#e1e0d9] px-5 py-3 text-sm text-[#52514e]">
                            {n.typeSortie && (
                              <span>
                                Type de sortie{' '}
                                <span className="font-semibold text-[#0b0b0b]">{n.typeSortie}</span>
                              </span>
                            )}
                            {n.poidsSortieKg != null && (
                              <span>
                                Poids sortie{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.poidsSortieKg} kg
                                </span>
                              </span>
                            )}
                            {n.poidsMinimumKg != null && (
                              <span>
                                Poids minimum{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.poidsMinimumKg} kg
                                  {n.datePoidsMinimum ? ` (${formatDate(n.datePoidsMinimum)})` : ''}
                                </span>
                              </span>
                            )}
                            {n.seancesStimulationPsychocognitive != null && (
                              <span>
                                Séances stimulation{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.seancesStimulationPsychocognitive}
                                </span>
                              </span>
                            )}
                            {n.seancesCcsc != null && (
                              <span>
                                Séances CCSC{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.seancesCcsc}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      {isUrenam &&
                        (n.beneficiairePoudreNutritive != null ||
                          n.beneficiairePlaquette != null ||
                          n.dureeSejourJours != null) && (
                          <div className="flex flex-wrap gap-6 border-t border-[#e1e0d9] px-5 py-3 text-sm text-[#52514e]">
                            {n.beneficiairePoudreNutritive != null && (
                              <span>
                                Poudre nutritive{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.beneficiairePoudreNutritive ? 'Oui' : 'Non'}
                                </span>
                              </span>
                            )}
                            {n.beneficiairePlaquette != null && (
                              <span>
                                Plaquette{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.beneficiairePlaquette ? 'Oui' : 'Non'}
                                </span>
                              </span>
                            )}
                            {n.dureeSejourJours != null && (
                              <span>
                                Durée{' '}
                                <span className="font-semibold text-[#0b0b0b]">
                                  {n.dureeSejourJours} j
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      {n.observations && (
                        <div className="border-t border-[#e1e0d9] px-5 py-3">
                          <p className="text-xs uppercase tracking-wide text-[#898781]">
                            Observations
                          </p>
                          <p className="mt-0.5 text-sm text-[#0b0b0b]">{n.observations}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <h2 className="mb-4 mt-8 font-semibold text-[#0b0b0b]">Historique vaccination</h2>
            {patient.vaccinations.length === 0 ? (
              <p className="text-sm text-[#898781]">Aucune vaccination enregistrée.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {patient.vaccinations.map((v) => (
                  <div
                    key={v.id}
                    className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-5 py-3">
                      <div>
                        <span className="text-sm font-semibold text-[#0b0b0b]">
                          {formatDate(v.date)}
                        </span>{' '}
                        <span className="ml-2 rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                          {v.antigene}
                          {v.numeroDose != null ? ` — dose ${v.numeroDose}` : ''}
                        </span>
                      </div>
                      {v.providerName && (
                        <span className="text-xs text-[#898781]">{v.providerName}</span>
                      )}
                    </div>
                    {(v.siteInjection || v.prochainRdv) && (
                      <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-[#52514e]">
                        {v.siteInjection && (
                          <span>
                            Site{' '}
                            <span className="font-semibold text-[#0b0b0b]">{v.siteInjection}</span>
                          </span>
                        )}
                        {v.prochainRdv && (
                          <span>
                            Prochain RDV{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {formatDate(v.prochainRdv)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    {(v.pfppCounselingPropose ||
                      v.methodePfAdoptee ||
                      v.conseilsAme ||
                      v.pratiqueAme) && (
                      <div className="flex flex-wrap gap-6 border-t border-[#e1e0d9] px-5 py-3 text-sm text-[#52514e]">
                        {v.pfppCounselingPropose && (
                          <span className="rounded-full bg-[#e1e0d9] px-2 py-0.5 text-xs font-medium text-[#52514e]">
                            Counseling PFPP proposé
                          </span>
                        )}
                        {v.methodePfAdoptee && (
                          <span>
                            Méthode PF adoptée{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {v.methodePfAdoptee}
                            </span>
                          </span>
                        )}
                        {v.conseilsAme && (
                          <span>
                            Conseils AME{' '}
                            <span className="font-semibold text-[#0b0b0b]">{v.conseilsAme}</span>
                          </span>
                        )}
                        {v.pratiqueAme && (
                          <span>
                            Pratique AME{' '}
                            <span className="font-semibold text-[#0b0b0b]">{v.pratiqueAme}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {v.observations && (
                      <div className="border-t border-[#e1e0d9] px-5 py-3">
                        <p className="text-xs uppercase tracking-wide text-[#898781]">
                          Observations
                        </p>
                        <p className="mt-0.5 text-sm text-[#0b0b0b]">{v.observations}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h2 className="mb-4 mt-8 font-semibold text-[#0b0b0b]">Historique hospitalisation</h2>
            {patient.hospitalisations.length === 0 ? (
              <p className="text-sm text-[#898781]">Aucune hospitalisation enregistrée.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {patient.hospitalisations.map((h) => (
                  <div
                    key={h.id}
                    className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-5 py-3">
                      <div>
                        <span className="text-sm font-semibold text-[#0b0b0b]">
                          {formatDate(h.dateHeureEntree)}
                        </span>{' '}
                        <span className="text-sm text-[#52514e]">{h.motifAdmission}</span>
                        {h.dateHeureSortie ? (
                          <span className="ml-2 rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                            Sorti le {formatDate(h.dateHeureSortie)}
                          </span>
                        ) : (
                          <span className="ml-2 rounded-full bg-[#d08a1c]/10 px-2 py-0.5 text-xs font-medium text-[#d08a1c]">
                            En cours
                          </span>
                        )}
                        {h.indigent && (
                          <span className="ml-2 rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-xs font-medium text-[#d03b3b]">
                            Indigent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {h.providerName && (
                          <span className="text-xs text-[#898781]">{h.providerName}</span>
                        )}
                        {!h.dateHeureSortie && (
                          <Link
                            href={`/patients/${patient.id}/hospitalisation/${h.id}/sortie`}
                            className="print:hidden text-xs font-medium text-[#2a78d6] hover:underline"
                          >
                            Enregistrer la sortie →
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-[#52514e]">
                      {h.service && (
                        <span>
                          Service <span className="font-semibold text-[#0b0b0b]">{h.service}</span>
                        </span>
                      )}
                      {h.numeroHospitalisation && (
                        <span>
                          N° Hosp{' '}
                          <span className="font-semibold text-[#0b0b0b]">
                            {h.numeroHospitalisation}
                          </span>
                        </span>
                      )}
                      {h.referenceOrigine && (
                        <span>
                          Référence{' '}
                          <span className="font-semibold text-[#0b0b0b]">{h.referenceOrigine}</span>
                        </span>
                      )}
                      {h.profession && (
                        <span>
                          Profession{' '}
                          <span className="font-semibold text-[#0b0b0b]">{h.profession}</span>
                        </span>
                      )}
                      {h.telephoneContact && (
                        <span>
                          Téléphone{' '}
                          <span className="font-semibold text-[#0b0b0b]">{h.telephoneContact}</span>
                        </span>
                      )}
                      {h.localisationPrecise && (
                        <span>
                          Localisation{' '}
                          <span className="font-semibold text-[#0b0b0b]">
                            {h.localisationPrecise}
                          </span>
                        </span>
                      )}
                      {h.diagnosticPrincipal && (
                        <span>
                          Diagnostic{' '}
                          <span className="font-semibold text-[#0b0b0b]">
                            {h.diagnosticPrincipal}
                          </span>
                        </span>
                      )}
                      {h.issue && (
                        <span>
                          Issue <span className="font-semibold text-[#0b0b0b]">{h.issue}</span>
                        </span>
                      )}
                    </div>
                    {h.observations && (
                      <div className="border-t border-[#e1e0d9] px-5 py-3">
                        <p className="text-xs uppercase tracking-wide text-[#898781]">
                          Observations
                        </p>
                        <p className="mt-0.5 text-sm text-[#0b0b0b]">{h.observations}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h2 className="mb-4 mt-8 font-semibold text-[#0b0b0b]">
              Historique planification familiale
            </h2>
            {patient.planificationsFamiliales.length === 0 ? (
              <p className="text-sm text-[#898781]">Aucune visite PF enregistrée.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {patient.planificationsFamiliales.map((pf) => (
                  <div
                    key={pf.id}
                    className="overflow-hidden rounded-lg border border-[#e1e0d9] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-5 py-3">
                      <div>
                        <span className="text-sm font-semibold text-[#0b0b0b]">
                          {formatDate(pf.date)}
                        </span>{' '}
                        <span className="ml-2 rounded-full bg-[#2a78d6]/10 px-2 py-0.5 text-xs font-medium text-[#2a78d6]">
                          {pf.methodeChoisie}
                          {pf.actionMethode ? ` — ${pf.actionMethode}` : ''}
                        </span>
                        <span className="ml-2 rounded-full bg-[#e1e0d9] px-2 py-0.5 text-xs font-medium text-[#52514e]">
                          {pf.typeVisite}
                        </span>
                        {pf.ppi && (
                          <span className="ml-2 rounded-full bg-[#d08a1c]/10 px-2 py-0.5 text-xs font-medium text-[#d08a1c]">
                            PPI
                          </span>
                        )}
                      </div>
                      {pf.providerName && (
                        <span className="text-xs text-[#898781]">{pf.providerName}</span>
                      )}
                    </div>
                    {(pf.typeUtilisateur ||
                      pf.ageDernierEnfantMois != null ||
                      pf.nbreCyclesDistribues != null ||
                      pf.serviceProvenance ||
                      pf.prochainRdv) && (
                      <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-[#52514e]">
                        {pf.typeUtilisateur && (
                          <span>
                            Utilisatrice{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {pf.typeUtilisateur === 'Nouveau' ? 'Nouvelle' : 'Ancienne'}
                            </span>
                          </span>
                        )}
                        {pf.ageDernierEnfantMois != null && (
                          <span>
                            Âge dernier enfant{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {pf.ageDernierEnfantMois} mois
                            </span>
                          </span>
                        )}
                        {pf.nbreCyclesDistribues != null && (
                          <span>
                            Cycles distribués{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {pf.nbreCyclesDistribues}
                            </span>
                          </span>
                        )}
                        {pf.serviceProvenance && (
                          <span>
                            Provenance{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {pf.serviceProvenance}
                            </span>
                          </span>
                        )}
                        {pf.prochainRdv && (
                          <span>
                            Prochain RDV{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {formatDate(pf.prochainRdv)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    {(pf.pratiqueAme ||
                      pf.enfantAJourVaccins ||
                      pf.conseilsAlimentationComplement) && (
                      <div className="flex flex-wrap gap-6 border-t border-[#e1e0d9] px-5 py-3 text-sm text-[#52514e]">
                        {pf.pratiqueAme && (
                          <span>
                            AME{' '}
                            <span className="font-semibold text-[#0b0b0b]">{pf.pratiqueAme}</span>
                          </span>
                        )}
                        {pf.enfantAJourVaccins && (
                          <span>
                            Vaccins enfant à jour{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {pf.enfantAJourVaccins}
                            </span>
                          </span>
                        )}
                        {pf.conseilsAlimentationComplement && (
                          <span>
                            Conseils alim. complément{' '}
                            <span className="font-semibold text-[#0b0b0b]">
                              {pf.conseilsAlimentationComplement}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    {pf.observations && (
                      <div className="border-t border-[#e1e0d9] px-5 py-3">
                        <p className="text-xs uppercase tracking-wide text-[#898781]">
                          Observations
                        </p>
                        <p className="mt-0.5 text-sm text-[#0b0b0b]">{pf.observations}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
