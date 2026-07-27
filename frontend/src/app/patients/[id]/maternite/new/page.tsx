'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/contexts/ToastContext';

type MaterniteType = 'CPN' | 'ACCOUCHEMENT' | 'CPON';

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

const TYPE_LABEL: Record<MaterniteType, string> = {
  CPN: 'CPN — Consultation prénatale',
  ACCOUCHEMENT: 'Accouchement',
  CPON: 'CPoN — Consultation postnatale',
};

// CPoN reste scaffoldée mais hors V1 — seuls CPN et Accouchement sont
// sélectionnables ici (voir décision V1 du 2026-07-27).
const SELECTABLE_TYPES: MaterniteType[] = ['CPN', 'ACCOUCHEMENT'];

export default function NewMaternitePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [type, setType] = useState<MaterniteType>('CPN');

  // Communs
  const [gestite, setGestite] = useState('');
  const [parite, setParite] = useState('');
  const [dpa, setDpa] = useState('');
  const [ddr, setDdr] = useState('');
  const [statutMatrimonial, setStatutMatrimonial] = useState('');
  const [observations, setObservations] = useState('');

  // CPN
  const [cpnNumeroVisite, setCpnNumeroVisite] = useState('');
  const [ageGestationnelSemaines, setAgeGestationnelSemaines] = useState('');
  const [poidsKg, setPoidsKg] = useState('');
  const [tailleCm, setTailleCm] = useState('');
  const [perimetreBrachialCm, setPerimetreBrachialCm] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [tensionArterielle, setTensionArterielle] = useState('');
  const [hauteurUterineCm, setHauteurUterineCm] = useState('');
  const [bruitsCoeurFoetal, setBruitsCoeurFoetal] = useState('');
  const [mouvementsFoetaux, setMouvementsFoetaux] = useState('');
  const [oedemes, setOedemes] = useState(false);
  const [nombreAvortements, setNombreAvortements] = useState('');
  const [nombreEnfantsVivants, setNombreEnfantsVivants] = useState('');
  const [groupeSanguin, setGroupeSanguin] = useState('');
  const [testEmmel, setTestEmmel] = useState('');
  const [bw, setBw] = useState('');
  const [tauxHb, setTauxHb] = useState('');
  const [tpiDose, setTpiDose] = useState('');
  const [moustiquaireImpregnee, setMoustiquaireImpregnee] = useState(false);
  const [vatDose, setVatDose] = useState('');
  const [ferAcideFolique, setFerAcideFolique] = useState(false);
  const [ferAcideFoliqueDoseNumero, setFerAcideFoliqueDoseNumero] = useState('');
  const [albendazoleMebendazole, setAlbendazoleMebendazole] = useState(false);
  const [albuminurie, setAlbuminurie] = useState('');
  const [glycosurie, setGlycosurie] = useState('');
  const [vih, setVih] = useState('');
  const [planAccouchement, setPlanAccouchement] = useState('');
  const [risqueGrossesse, setRisqueGrossesse] = useState('');
  const [maladieDetectee, setMaladieDetectee] = useState('');
  const [prochainRdv, setProchainRdv] = useState('');

  // Accouchement
  const [dateHeureEntree, setDateHeureEntree] = useState('');
  const [enfantPrecedent, setEnfantPrecedent] = useState('');
  const [intervalleGrossessesMois, setIntervalleGrossessesMois] = useState('');
  const [lieuAccouchement, setLieuAccouchement] = useState('');
  const [natureAccouchement, setNatureAccouchement] = useState('');
  const [presentation, setPresentation] = useState('');
  const [modeAccouchement, setModeAccouchement] = useState('');
  const [gatpa, setGatpa] = useState(false);
  const [avortementType, setAvortementType] = useState('');
  const [methodeEvacuationAvortement, setMethodeEvacuationAvortement] = useState('');
  const [dureeTravailHeures, setDureeTravailHeures] = useState('');
  const [assistePar, setAssistePar] = useState('');
  const [vitamineA, setVitamineA] = useState(false);
  const [issueGrossesse, setIssueGrossesse] = useState('');
  const [sexeNouveauNe, setSexeNouveauNe] = useState('');
  const [misAuSein, setMisAuSein] = useState(false);
  const [smk, setSmk] = useState(false);
  const [tetracyclinePommade, setTetracyclinePommade] = useState(false);
  const [chlorhexidineDigluconate, setChlorhexidineDigluconate] = useState(false);
  const [poidsNaissanceG, setPoidsNaissanceG] = useState('');
  const [tailleNaissanceCm, setTailleNaissanceCm] = useState('');
  const [apgar1min, setApgar1min] = useState('');
  const [apgar5min, setApgar5min] = useState('');
  const [perimetreCranienCm, setPerimetreCranienCm] = useState('');
  const [reanimationNouveauNe, setReanimationNouveauNe] = useState(false);
  const [decesNouveauNeDelai, setDecesNouveauNeDelai] = useState('');
  const [causesDeces, setCausesDeces] = useState('');
  const [decesMaternelMoment, setDecesMaternelMoment] = useState('');
  const [causesDecesMaternel, setCausesDecesMaternel] = useState('');
  const [praticienQualification, setPraticienQualification] = useState('');
  const [complicationsAccouchement, setComplicationsAccouchement] = useState('');
  const [complicationsNouveauNe, setComplicationsNouveauNe] = useState('');
  const [episiotomie, setEpisiotomie] = useState(false);
  const [placentaComplet, setPlacentaComplet] = useState(false);

  // CPoN
  const [cponNumeroVisite, setCponNumeroVisite] = useState('');
  const [joursPostPartum, setJoursPostPartum] = useState('');
  const [etatPerinee, setEtatPerinee] = useState('');
  const [allaitement, setAllaitement] = useState('');
  const [planificationFamiliale, setPlanificationFamiliale] = useState('');
  const [etatNouveauNeCpon, setEtatNouveauNeCpon] = useState('');
  const [vaccinationBcgFait, setVaccinationBcgFait] = useState(false);

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
    try {
      await api(`/api/patients/${params.id}/maternite`, {
        method: 'POST',
        body: {
          type,
          ...(gestite ? { gestite: Number(gestite) } : {}),
          ...(parite ? { parite: Number(parite) } : {}),
          ...(dpa ? { dpa } : {}),
          ...(ddr ? { ddr } : {}),
          ...(statutMatrimonial ? { statutMatrimonial } : {}),
          ...(observations ? { observations } : {}),

          ...(type === 'CPN'
            ? {
                ...(cpnNumeroVisite ? { cpnNumeroVisite: Number(cpnNumeroVisite) } : {}),
                ...(ageGestationnelSemaines
                  ? { ageGestationnelSemaines: Number(ageGestationnelSemaines) }
                  : {}),
                ...(poidsKg ? { poidsKg: Number(poidsKg) } : {}),
                ...(tailleCm ? { tailleCm: Number(tailleCm) } : {}),
                ...(perimetreBrachialCm
                  ? { perimetreBrachialCm: Number(perimetreBrachialCm) }
                  : {}),
                ...(temperatureC ? { temperatureC: Number(temperatureC) } : {}),
                ...(tensionArterielle ? { tensionArterielle } : {}),
                ...(hauteurUterineCm ? { hauteurUterineCm: Number(hauteurUterineCm) } : {}),
                ...(bruitsCoeurFoetal ? { bruitsCoeurFoetal } : {}),
                ...(mouvementsFoetaux ? { mouvementsFoetaux } : {}),
                oedemes,
                ...(nombreAvortements ? { nombreAvortements: Number(nombreAvortements) } : {}),
                ...(nombreEnfantsVivants
                  ? { nombreEnfantsVivants: Number(nombreEnfantsVivants) }
                  : {}),
                ...(groupeSanguin ? { groupeSanguin } : {}),
                ...(testEmmel ? { testEmmel } : {}),
                ...(bw ? { bw } : {}),
                ...(tauxHb ? { tauxHb: Number(tauxHb) } : {}),
                ...(tpiDose ? { tpiDose: Number(tpiDose) } : {}),
                moustiquaireImpregnee,
                ...(vatDose ? { vatDose: Number(vatDose) } : {}),
                ferAcideFolique,
                ...(ferAcideFoliqueDoseNumero
                  ? { ferAcideFoliqueDoseNumero: Number(ferAcideFoliqueDoseNumero) }
                  : {}),
                albendazoleMebendazole,
                ...(albuminurie ? { albuminurie } : {}),
                ...(glycosurie ? { glycosurie } : {}),
                ...(vih ? { vih } : {}),
                ...(planAccouchement ? { planAccouchement } : {}),
                ...(risqueGrossesse ? { risqueGrossesse } : {}),
                ...(maladieDetectee ? { maladieDetectee } : {}),
                ...(prochainRdv ? { prochainRdv } : {}),
              }
            : {}),

          ...(type === 'ACCOUCHEMENT'
            ? {
                ...(dateHeureEntree ? { dateHeureEntree } : {}),
                ...(enfantPrecedent ? { enfantPrecedent } : {}),
                ...(intervalleGrossessesMois
                  ? { intervalleGrossessesMois: Number(intervalleGrossessesMois) }
                  : {}),
                ...(lieuAccouchement ? { lieuAccouchement } : {}),
                ...(natureAccouchement ? { natureAccouchement } : {}),
                ...(presentation ? { presentation } : {}),
                ...(modeAccouchement ? { modeAccouchement } : {}),
                gatpa,
                ...(avortementType ? { avortementType } : {}),
                ...(methodeEvacuationAvortement ? { methodeEvacuationAvortement } : {}),
                albendazoleMebendazole,
                ...(dureeTravailHeures ? { dureeTravailHeures: Number(dureeTravailHeures) } : {}),
                ...(assistePar ? { assistePar } : {}),
                vitamineA,
                ...(issueGrossesse ? { issueGrossesse } : {}),
                ...(sexeNouveauNe ? { sexeNouveauNe } : {}),
                misAuSein,
                smk,
                tetracyclinePommade,
                chlorhexidineDigluconate,
                ...(poidsNaissanceG ? { poidsNaissanceG: Number(poidsNaissanceG) } : {}),
                ...(tailleNaissanceCm ? { tailleNaissanceCm: Number(tailleNaissanceCm) } : {}),
                ...(apgar1min ? { apgar1min: Number(apgar1min) } : {}),
                ...(apgar5min ? { apgar5min: Number(apgar5min) } : {}),
                ...(perimetreCranienCm ? { perimetreCranienCm: Number(perimetreCranienCm) } : {}),
                reanimationNouveauNe,
                ...(decesNouveauNeDelai ? { decesNouveauNeDelai } : {}),
                ...(causesDeces ? { causesDeces } : {}),
                ...(decesMaternelMoment ? { decesMaternelMoment } : {}),
                ...(causesDecesMaternel ? { causesDecesMaternel } : {}),
                ...(praticienQualification ? { praticienQualification } : {}),
                ...(complicationsAccouchement ? { complicationsAccouchement } : {}),
                ...(complicationsNouveauNe ? { complicationsNouveauNe } : {}),
                episiotomie,
                placentaComplet,
              }
            : {}),

          ...(type === 'CPON'
            ? {
                ...(cponNumeroVisite ? { cponNumeroVisite: Number(cponNumeroVisite) } : {}),
                ...(joursPostPartum ? { joursPostPartum: Number(joursPostPartum) } : {}),
                ...(etatPerinee ? { etatPerinee } : {}),
                ...(allaitement ? { allaitement } : {}),
                ...(planificationFamiliale ? { planificationFamiliale } : {}),
                ...(etatNouveauNeCpon ? { etatNouveauNeCpon } : {}),
                vaccinationBcgFait,
              }
            : {}),
        },
      });
      toast('Fiche de maternité enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre de ce type est déjà clôturé pour ce mois — impossible d’ajouter une fiche.'
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
          / Nouvelle fiche maternité
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Nouvelle fiche maternité</h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-maternite-form"
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

        <form id="new-maternite-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Type d&rsquo;acte</h2>
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
              <Field label="Gestité (G)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={gestite}
                  onChange={(e) => setGestite(e.target.value)}
                />
              </Field>
              <Field label="Parité (P)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={parite}
                  onChange={(e) => setParite(e.target.value)}
                />
              </Field>
              <Field label="DDR — Date des dernières règles">
                <input
                  type="date"
                  className={inputClass}
                  value={ddr}
                  onChange={(e) => setDdr(e.target.value)}
                />
              </Field>
              <Field label="DPA — Date prévue d'accouchement">
                <input
                  type="date"
                  className={inputClass}
                  value={dpa}
                  onChange={(e) => setDpa(e.target.value)}
                />
              </Field>
              <Field label="Statut matrimonial">
                <select
                  className={inputClass}
                  value={statutMatrimonial}
                  onChange={(e) => setStatutMatrimonial(e.target.value)}
                >
                  <option value="">Non renseigné</option>
                  <option value="Célibataire">Célibataire</option>
                  <option value="Marié(e)">Marié(e)</option>
                  <option value="Divorcé(e)">Divorcé(e)</option>
                  <option value="Veuf/Veuve">Veuf/Veuve</option>
                </select>
              </Field>
              <div className="sm:col-span-3">
                <Field label="Observations">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>

          {type === 'CPN' && (
            <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-4 font-semibold text-[#0b0b0b]">Consultation prénatale (CPN)</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="N° de visite CPN">
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={cpnNumeroVisite}
                    onChange={(e) => setCpnNumeroVisite(e.target.value)}
                  />
                </Field>
                <Field label="Âge gestationnel (semaines)">
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={ageGestationnelSemaines}
                    onChange={(e) => setAgeGestationnelSemaines(e.target.value)}
                  />
                </Field>
                <Field label="Prochain RDV">
                  <input
                    type="date"
                    className={inputClass}
                    value={prochainRdv}
                    onChange={(e) => setProchainRdv(e.target.value)}
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
                <Field label="Périmètre brachial — PB (cm)">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={perimetreBrachialCm}
                    onChange={(e) => setPerimetreBrachialCm(e.target.value)}
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
                <Field label="Tension artérielle">
                  <input
                    className={inputClass}
                    placeholder="110/70"
                    value={tensionArterielle}
                    onChange={(e) => setTensionArterielle(e.target.value)}
                  />
                </Field>
                <Field label="Hauteur utérine (cm)">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={hauteurUterineCm}
                    onChange={(e) => setHauteurUterineCm(e.target.value)}
                  />
                </Field>
                <Field label="Nombre d'avortements">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={nombreAvortements}
                    onChange={(e) => setNombreAvortements(e.target.value)}
                  />
                </Field>
                <Field label="Nombre d'enfants en vie">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={nombreEnfantsVivants}
                    onChange={(e) => setNombreEnfantsVivants(e.target.value)}
                  />
                </Field>
                <Field label="Groupe sanguin">
                  <select
                    className={inputClass}
                    value={groupeSanguin}
                    onChange={(e) => setGroupeSanguin(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </Field>
                <Field label="B.W. (syphilis)">
                  <select className={inputClass} value={bw} onChange={(e) => setBw(e.target.value)}>
                    <option value="">Non fait</option>
                    <option value="Positif">Positif</option>
                    <option value="Négatif">Négatif</option>
                  </select>
                </Field>
                <Field label="Test d'Emmel (drépanocytose)">
                  <select
                    className={inputClass}
                    value={testEmmel}
                    onChange={(e) => setTestEmmel(e.target.value)}
                  >
                    <option value="">Non fait</option>
                    <option value="Positif">Positif</option>
                    <option value="Négatif">Négatif</option>
                  </select>
                </Field>
                <Field label="Taux d'Hb (g/dl)">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={tauxHb}
                    onChange={(e) => setTauxHb(e.target.value)}
                  />
                </Field>
                <Field label="Bruits du cœur fœtal">
                  <select
                    className={inputClass}
                    value={bruitsCoeurFoetal}
                    onChange={(e) => setBruitsCoeurFoetal(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Perçus">Perçus</option>
                    <option value="Non perçus">Non perçus</option>
                  </select>
                </Field>
                <Field label="Mouvements fœtaux">
                  <select
                    className={inputClass}
                    value={mouvementsFoetaux}
                    onChange={(e) => setMouvementsFoetaux(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Perçus">Perçus</option>
                    <option value="Non perçus">Non perçus</option>
                  </select>
                </Field>
                <Field label="Dose TPI">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={tpiDose}
                    onChange={(e) => setTpiDose(e.target.value)}
                  />
                </Field>
                <Field label="Dose VAT">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={vatDose}
                    onChange={(e) => setVatDose(e.target.value)}
                  />
                </Field>
                <Field label="Albuminurie">
                  <select
                    className={inputClass}
                    value={albuminurie}
                    onChange={(e) => setAlbuminurie(e.target.value)}
                  >
                    <option value="">Non fait</option>
                    <option value="Positif">Positif</option>
                    <option value="Négatif">Négatif</option>
                  </select>
                </Field>
                <Field label="Glycosurie">
                  <select
                    className={inputClass}
                    value={glycosurie}
                    onChange={(e) => setGlycosurie(e.target.value)}
                  >
                    <option value="">Non fait</option>
                    <option value="Positif">Positif</option>
                    <option value="Négatif">Négatif</option>
                  </select>
                </Field>
                <Field label="VIH">
                  <select
                    className={inputClass}
                    value={vih}
                    onChange={(e) => setVih(e.target.value)}
                  >
                    <option value="">Non fait</option>
                    <option value="Positif">Positif</option>
                    <option value="Négatif">Négatif</option>
                    <option value="Connu positif">Connu positif</option>
                  </select>
                </Field>
                <Field label="Dose fer/acide folique (1 à 4)">
                  <input
                    type="number"
                    min="1"
                    max="4"
                    className={inputClass}
                    value={ferAcideFoliqueDoseNumero}
                    onChange={(e) => setFerAcideFoliqueDoseNumero(e.target.value)}
                  />
                </Field>
                <Field label="Risque de grossesse">
                  <input
                    className={inputClass}
                    value={risqueGrossesse}
                    onChange={(e) => setRisqueGrossesse(e.target.value)}
                  />
                </Field>
                <Field label="Maladie détectée">
                  <input
                    className={inputClass}
                    value={maladieDetectee}
                    onChange={(e) => setMaladieDetectee(e.target.value)}
                  />
                </Field>
                <Field label="Plan d'accouchement">
                  <input
                    className={inputClass}
                    value={planAccouchement}
                    onChange={(e) => setPlanAccouchement(e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={oedemes}
                    onChange={(e) => setOedemes(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Œdèmes
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={moustiquaireImpregnee}
                    onChange={(e) => setMoustiquaireImpregnee(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Moustiquaire imprégnée remise
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={ferAcideFolique}
                    onChange={(e) => setFerAcideFolique(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Fer / acide folique donné
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={albendazoleMebendazole}
                    onChange={(e) => setAlbendazoleMebendazole(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Albendazole / Mébendazole donné
                </label>
              </div>
            </div>
          )}

          {type === 'ACCOUCHEMENT' && (
            <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-4 font-semibold text-[#0b0b0b]">Accouchement</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Date et heure d'entrée">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={dateHeureEntree}
                    onChange={(e) => setDateHeureEntree(e.target.value)}
                  />
                </Field>
                <Field label="Enfant précédent">
                  <select
                    className={inputClass}
                    value={enfantPrecedent}
                    onChange={(e) => setEnfantPrecedent(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Vivant">Vivant</option>
                    <option value="Décédé">Décédé</option>
                    <option value="Mort-né">Mort-né</option>
                    <option value="Avortement">Avortement</option>
                  </select>
                </Field>
                <Field label="Intervalle entre les 2 dernières grossesses (mois)">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={intervalleGrossessesMois}
                    onChange={(e) => setIntervalleGrossessesMois(e.target.value)}
                  />
                </Field>
                <Field label="Lieu">
                  <select
                    className={inputClass}
                    value={lieuAccouchement}
                    onChange={(e) => setLieuAccouchement(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Maternité">Maternité</option>
                    <option value="Domicile">Domicile</option>
                  </select>
                </Field>
                <Field label="Nature">
                  <select
                    className={inputClass}
                    value={natureAccouchement}
                    onChange={(e) => setNatureAccouchement(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Avant terme">Avant terme</option>
                    <option value="À terme">À terme</option>
                    <option value="Post-terme">Post-terme</option>
                  </select>
                </Field>
                <Field label="Présentation">
                  <input
                    className={inputClass}
                    placeholder="Céphalique, siège, transverse..."
                    value={presentation}
                    onChange={(e) => setPresentation(e.target.value)}
                  />
                </Field>
                <Field label="Type d'avortement">
                  <input
                    className={inputClass}
                    value={avortementType}
                    onChange={(e) => setAvortementType(e.target.value)}
                  />
                </Field>
                <Field label="Méthode d'évacuation (avortement)">
                  <input
                    className={inputClass}
                    value={methodeEvacuationAvortement}
                    onChange={(e) => setMethodeEvacuationAvortement(e.target.value)}
                  />
                </Field>
                <Field label="Mode d'accouchement">
                  <select
                    className={inputClass}
                    value={modeAccouchement}
                    onChange={(e) => setModeAccouchement(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Voie basse">Voie basse</option>
                    <option value="Césarienne">Césarienne</option>
                    <option value="Instrumental">Instrumental</option>
                  </select>
                </Field>
                <Field label="Durée du travail (heures)">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={dureeTravailHeures}
                    onChange={(e) => setDureeTravailHeures(e.target.value)}
                  />
                </Field>
                <Field label="Assisté par">
                  <select
                    className={inputClass}
                    value={assistePar}
                    onChange={(e) => setAssistePar(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Sage-femme">Sage-femme</option>
                    <option value="Médecin">Médecin</option>
                    <option value="Matrone">Matrone</option>
                    <option value="Auxiliaire">Auxiliaire</option>
                  </select>
                </Field>
                <Field label="Praticien — qualification">
                  <input
                    className={inputClass}
                    value={praticienQualification}
                    onChange={(e) => setPraticienQualification(e.target.value)}
                  />
                </Field>
                <Field label="Issue de grossesse">
                  <select
                    className={inputClass}
                    value={issueGrossesse}
                    onChange={(e) => setIssueGrossesse(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Vivant">Vivant</option>
                    <option value="Mort-né frais">Mort-né frais</option>
                    <option value="Mort-né macéré">Mort-né macéré</option>
                  </select>
                </Field>
                <Field label="Sexe du nouveau-né">
                  <select
                    className={inputClass}
                    value={sexeNouveauNe}
                    onChange={(e) => setSexeNouveauNe(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </Field>
                <Field label="Poids de naissance (g)">
                  <input
                    type="number"
                    step="1"
                    className={inputClass}
                    value={poidsNaissanceG}
                    onChange={(e) => setPoidsNaissanceG(e.target.value)}
                  />
                </Field>
                <Field label="Taille de naissance (cm)">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={tailleNaissanceCm}
                    onChange={(e) => setTailleNaissanceCm(e.target.value)}
                  />
                </Field>
                <Field label="Apgar 1 min">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    className={inputClass}
                    value={apgar1min}
                    onChange={(e) => setApgar1min(e.target.value)}
                  />
                </Field>
                <Field label="Apgar 5 min">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    className={inputClass}
                    value={apgar5min}
                    onChange={(e) => setApgar5min(e.target.value)}
                  />
                </Field>
                <Field label="Périmètre crânien (cm)">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={perimetreCranienCm}
                    onChange={(e) => setPerimetreCranienCm(e.target.value)}
                  />
                </Field>
                <Field label="Décès du nouveau-né">
                  <select
                    className={inputClass}
                    value={decesNouveauNeDelai}
                    onChange={(e) => setDecesNouveauNeDelai(e.target.value)}
                  >
                    <option value="">Aucun</option>
                    <option value="24 heures">Dans les 24 heures</option>
                    <option value="7 jours">Avant le 7ème jour</option>
                    <option value="28 jours">Dans les 28 jours</option>
                  </select>
                </Field>
                <Field label="Décès maternel — moment">
                  <select
                    className={inputClass}
                    value={decesMaternelMoment}
                    onChange={(e) => setDecesMaternelMoment(e.target.value)}
                  >
                    <option value="">Aucun</option>
                    <option value="Avant">Avant l&rsquo;accouchement</option>
                    <option value="Pendant">Pendant l&rsquo;accouchement</option>
                    <option value="Après">Après l&rsquo;accouchement</option>
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Complications (mère)">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={complicationsAccouchement}
                    onChange={(e) => setComplicationsAccouchement(e.target.value)}
                  />
                </Field>
                <Field label="Complications (nouveau-né)">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={complicationsNouveauNe}
                    onChange={(e) => setComplicationsNouveauNe(e.target.value)}
                  />
                </Field>
                <Field label="Causes de décès (nouveau-né)">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={causesDeces}
                    onChange={(e) => setCausesDeces(e.target.value)}
                  />
                </Field>
                <Field label="Causes de décès (mère)">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={causesDecesMaternel}
                    onChange={(e) => setCausesDecesMaternel(e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={gatpa}
                    onChange={(e) => setGatpa(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  GATPA appliquée
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={vitamineA}
                    onChange={(e) => setVitamineA(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Vitamine A donnée
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={misAuSein}
                    onChange={(e) => setMisAuSein(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Mis au sein immédiatement
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={smk}
                    onChange={(e) => setSmk(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  SMK (soins mère kangourou)
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={reanimationNouveauNe}
                    onChange={(e) => setReanimationNouveauNe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Réanimation du nouveau-né
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={episiotomie}
                    onChange={(e) => setEpisiotomie(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Épisiotomie
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={placentaComplet}
                    onChange={(e) => setPlacentaComplet(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Placenta complet
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={albendazoleMebendazole}
                    onChange={(e) => setAlbendazoleMebendazole(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Albendazole / Mébendazole donné
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={tetracyclinePommade}
                    onChange={(e) => setTetracyclinePommade(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Tétracycline (pommade oculaire)
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={chlorhexidineDigluconate}
                    onChange={(e) => setChlorhexidineDigluconate(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Chlorhexidine digluconate (cordon)
                </label>
              </div>
            </div>
          )}

          {type === 'CPON' && (
            <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
              <h2 className="mb-4 font-semibold text-[#0b0b0b]">Consultation postnatale (CPoN)</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="N° de visite CPoN">
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={cponNumeroVisite}
                    onChange={(e) => setCponNumeroVisite(e.target.value)}
                  />
                </Field>
                <Field label="Jours post-partum">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={joursPostPartum}
                    onChange={(e) => setJoursPostPartum(e.target.value)}
                  />
                </Field>
                <Field label="État du périnée">
                  <select
                    className={inputClass}
                    value={etatPerinee}
                    onChange={(e) => setEtatPerinee(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Normal">Normal</option>
                    <option value="Déhiscence">Déhiscence</option>
                    <option value="Infecté">Infecté</option>
                  </select>
                </Field>
                <Field label="Allaitement">
                  <select
                    className={inputClass}
                    value={allaitement}
                    onChange={(e) => setAllaitement(e.target.value)}
                  >
                    <option value="">Non renseigné</option>
                    <option value="Exclusif">Exclusif</option>
                    <option value="Mixte">Mixte</option>
                    <option value="Aucun">Aucun</option>
                  </select>
                </Field>
                <Field label="Planification familiale">
                  <input
                    className={inputClass}
                    value={planificationFamiliale}
                    onChange={(e) => setPlanificationFamiliale(e.target.value)}
                  />
                </Field>
                <Field label="État du nouveau-né">
                  <input
                    className={inputClass}
                    value={etatNouveauNeCpon}
                    onChange={(e) => setEtatNouveauNeCpon(e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={vaccinationBcgFait}
                    onChange={(e) => setVaccinationBcgFait(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Vaccination BCG faite
                </label>
              </div>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
