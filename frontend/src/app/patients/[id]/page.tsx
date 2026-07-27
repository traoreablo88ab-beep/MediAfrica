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
}

const MATERNITE_TYPE_LABEL: Record<string, string> = {
  CPN: 'CPN',
  ACCOUCHEMENT: 'Accouchement',
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
                      c.ge) && (
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
                      {!m.cpnNumeroVisite &&
                        !m.ageGestationnelSemaines &&
                        !m.prochainRdv &&
                        !m.modeAccouchement &&
                        !m.issueGrossesse &&
                        !m.sexeNouveauNe &&
                        m.poidsNaissanceG == null && <span>—</span>}
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
          </div>
        </div>
      </div>
    </main>
  );
}
