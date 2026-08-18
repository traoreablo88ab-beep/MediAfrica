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

// Liste officielle du "Rapport de morbidité et de mortalité" (RMA, section 7) —
// mêmes libellés que le tableau âge × sexe de /registres/rma. `hasDeces`
// indique si l'affection a une ligne "Décès (D-C)" dans le RMA officiel ;
// sinon la case Décès n'est pas affichée pour ce choix.
const MORBIDITE_AFFECTIONS: { code: string; label: string; hasDeces: boolean }[] = [
  { code: 'A00', label: 'Choléra', hasDeces: true },
  { code: 'A09', label: 'Diarrhée présumée infectieuse (hors choléra)', hasDeces: true },
  { code: 'B05', label: 'Rougeole', hasDeces: true },
  { code: 'A35', label: 'Tétanos', hasDeces: true },
  { code: 'A33', label: 'Tétanos néo-natal', hasDeces: true },
  { code: 'O00-O99', label: 'Fistule obstétricale', hasDeces: true },
  { code: 'C00-D48', label: "Cancer du col de l'utérus", hasDeces: true },
  { code: 'C50', label: 'Cancer du sein', hasDeces: true },
  { code: 'A80', label: 'Paralysie Flasque Aiguë', hasDeces: false },
  { code: 'A39', label: 'Méningite cérébrospinale', hasDeces: true },
  { code: 'J22', label: 'Toux<15j, IRA basses (pneumonie, bronchopneumonie)', hasDeces: true },
  { code: 'J06.9', label: 'IRA hautes (rhinopharyngite, rhinite, trachéite)', hasDeces: false },
  { code: 'R05', label: 'Toux > 15 jours', hasDeces: true },
  { code: 'A16', label: 'Tuberculose suspecte', hasDeces: true },
  { code: 'A15.9', label: 'Tuberculose confirmée', hasDeces: true },
  { code: '—', label: 'Paludisme suspect', hasDeces: false },
  { code: '—', label: 'Cas présumés de paludisme simple (diagnostic clinique)', hasDeces: false },
  { code: '—', label: 'Cas présumés de paludisme grave (diagnostic clinique)', hasDeces: true },
  { code: 'B54', label: 'Paludisme simple confirmé', hasDeces: false },
  { code: 'B50.0', label: 'Paludisme grave confirmé', hasDeces: true },
  { code: 'A01', label: 'Fièvre typhoïde', hasDeces: true },
  { code: 'H10', label: 'Conjonctivites', hasDeces: false },
  { code: 'A71.9', label: 'Trachome', hasDeces: false },
  { code: 'H02.0', label: 'Trichiasis', hasDeces: false },
  { code: 'H26.9', label: 'Cataracte', hasDeces: false },
  { code: 'H40', label: 'Glaucome', hasDeces: false },
  { code: 'H52.7', label: 'Vices de réfraction et basses de vision', hasDeces: false },
  { code: 'H54.2', label: "Baisse d'Acuité visuelle (BAV)", hasDeces: false },
  {
    code: '—',
    label: 'Traumatismes oculaires (coup, accident domestique/travail)',
    hasDeces: false,
  },
  { code: 'H36.0', label: 'Rétinopathie diabétique', hasDeces: false },
  { code: 'B65.0', label: 'Bilharziose urinaire', hasDeces: false },
  { code: 'B82.0', label: 'Vers intestinaux', hasDeces: false },
  { code: 'R36', label: 'Écoulement urétral et/ou dysurie', hasDeces: false },
  { code: 'N76.6', label: 'Ulcération génitale', hasDeces: false },
  { code: 'A65', label: 'Syphilis endémique', hasDeces: false },
  { code: 'A56.2', label: 'Écoulement vaginal', hasDeces: false },
  { code: 'R10.2', label: 'Douleurs abdominales basses', hasDeces: false },
  { code: 'A54.3', label: 'Conjonctivite du nouveau-né', hasDeces: false },
  { code: 'E45', label: 'Insuffisance pondérale', hasDeces: false },
  { code: 'E43', label: 'Malnutrition Aiguë Sévère', hasDeces: true },
  { code: 'R62.8', label: 'Retard de croissance', hasDeces: false },
  { code: 'A05.9', label: "Intoxication alimentaire d'origine chimique", hasDeces: true },
  { code: '—', label: "Intoxication alimentaire d'origine microbienne", hasDeces: true },
  { code: 'O26.9', label: 'Troubles liés à la grossesse', hasDeces: true },
  { code: 'O90.9', label: "Troubles liés à l'accouchement et au post-partum", hasDeces: true },
  { code: 'R68.8a', label: 'Traumatisme lié aux accidents de la voie publique', hasDeces: true },
  {
    code: 'R68.8b',
    label: 'Traumatisme non lié aux accidents de la voie publique',
    hasDeces: true,
  },
  { code: 'S00-T98', label: 'Traumatismes : coups et blessures volontaires', hasDeces: true },
  { code: 'S00-T98', label: 'Traumatismes : accidents domestiques', hasDeces: true },
  { code: 'K02.9', label: 'Carie dentaire', hasDeces: false },
  { code: 'K05.1', label: 'Gingivite simple', hasDeces: false },
  { code: 'A69.1', label: 'Gingivite ulcéro-nécrotique aiguë', hasDeces: false },
  { code: 'A69.0', label: 'Noma', hasDeces: true },
  { code: 'K00-K14', label: 'Autres affections de la bouche et des dents', hasDeces: true },
  { code: 'I10', label: 'HTA', hasDeces: true },
  { code: 'H65', label: 'Otite aiguë', hasDeces: false },
  { code: 'H66', label: 'Otite purulente', hasDeces: false },
  { code: '—', label: 'Sinusite', hasDeces: false },
  { code: '—', label: 'Angine', hasDeces: false },
  { code: '—', label: 'Drépanocytose', hasDeces: true },
  { code: '—', label: 'Anémie', hasDeces: true },
  { code: '—', label: 'Diabète', hasDeces: true },
  { code: '—', label: 'Dracunculose', hasDeces: false },
  { code: 'B56', label: 'SIDA', hasDeces: true },
  { code: '—', label: 'Troubles mentaux', hasDeces: true },
  { code: '—', label: 'Eczéma', hasDeces: false },
  { code: '—', label: 'Intertrigo (mycose des plis)', hasDeces: false },
  { code: '—', label: 'Teigne', hasDeces: false },
  { code: '—', label: 'Gale', hasDeces: false },
  { code: '—', label: 'Pyodermite', hasDeces: false },
  { code: '—', label: 'Onchocercose', hasDeces: false },
  { code: '—', label: 'Trypanosomiase humaine africaine', hasDeces: true },
  { code: '—', label: 'Autres', hasDeces: true },
];

export default function NewConsultationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [motif, setMotif] = useState('');
  const [echelon, setEchelon] = useState('');
  const [typeCas, setTypeCas] = useState('');
  const [status, setStatus] = useState('attente');
  const [signes, setSignes] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [traitementPrescrit, setTraitementPrescrit] = useState('');
  const [tensionArterielle, setTensionArterielle] = useState('');
  const [poidsKg, setPoidsKg] = useState('');
  const [tailleCm, setTailleCm] = useState('');
  const [perimetreBrachialCm, setPerimetreBrachialCm] = useState('');
  const [statutPT, setStatutPT] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [tdr, setTdr] = useState('');
  const [ge, setGe] = useState('');
  const [mdo, setMdo] = useState(false);
  const [mdoMaladie, setMdoMaladie] = useState('');
  const [indigent, setIndigent] = useState(false);
  const [telephoneContact, setTelephoneContact] = useState('');
  const [localisationPrecise, setLocalisationPrecise] = useState('');
  const [codeAffection, setCodeAffection] = useState('');
  const [deces, setDeces] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAffectionHasDeces =
    MORBIDITE_AFFECTIONS.find((a) => a.label === codeAffection)?.hasDeces ?? false;

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
    const url = `/api/patients/${params.id}/consultations`;
    const body = {
      motif,
      echelon,
      ...(typeCas ? { typeCas } : {}),
      status,
      ...(signes ? { signes } : {}),
      ...(diagnostic ? { diagnostic } : {}),
      ...(traitementPrescrit ? { traitementPrescrit } : {}),
      ...(tensionArterielle ? { tensionArterielle } : {}),
      ...(poidsKg ? { poidsKg: Number(poidsKg) } : {}),
      ...(tailleCm ? { tailleCm: Number(tailleCm) } : {}),
      ...(perimetreBrachialCm ? { perimetreBrachialCm: Number(perimetreBrachialCm) } : {}),
      ...(statutPT ? { statutPT } : {}),
      ...(temperatureC ? { temperatureC: Number(temperatureC) } : {}),
      ...(tdr ? { tdr } : {}),
      ...(ge ? { ge } : {}),
      mdo,
      ...(mdo && mdoMaladie ? { mdoMaladie } : {}),
      indigent,
      ...(telephoneContact ? { telephoneContact } : {}),
      ...(localisationPrecise ? { localisationPrecise } : {}),
      codeAffection,
      ...(selectedAffectionHasDeces ? { deces } : {}),
    };

    // Already known to be offline — queue immediately rather than letting a
    // doomed request time out first.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueMutation({ url, body, resourceLabel: 'Consultation' });
      toast('Enregistré hors-ligne — sera synchronisé automatiquement.');
      router.push(`/patients/${params.id}`);
      setSubmitting(false);
      return;
    }

    try {
      await api(url, { method: 'POST', body });
      toast('Consultation enregistrée avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      // status === 0 is api.ts's own signal for a network-layer failure
      // (request never reached the server) — treat it as a dropped
      // connection mid-submit, not a validation/business rejection.
      if (err instanceof ApiError && err.status === 0) {
        await queueMutation({ url, body, resourceLabel: 'Consultation' });
        toast('Enregistré hors-ligne — sera synchronisé automatiquement.');
        router.push(`/patients/${params.id}`);
        setSubmitting(false);
        return;
      }
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre de consultation de ce mois est déjà clôturé — impossible d’ajouter une consultation.'
          : friendlyError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="consultations" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <p className="mb-4 text-sm text-[#898781]">
          <Link href="/patients" className="hover:underline">
            Patients
          </Link>{' '}
          /{' '}
          <Link href={`/patients/${params.id}`} className="hover:underline">
            {patientName ?? 'Fiche patient'}
          </Link>{' '}
          / Nouvelle consultation
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Nouvelle consultation</h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="new-consultation-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer la consultation'}
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

        <form id="new-consultation-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Motif et statut</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Motif de consultation" required>
                  <input
                    className={inputClass}
                    placeholder="Ex: Fièvre + céphalées"
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Structure (échelon)" required>
                <select
                  className={inputClass}
                  value={echelon}
                  required
                  onChange={(e) => setEchelon(e.target.value)}
                >
                  <option value="" disabled>
                    Sélectionner…
                  </option>
                  <option value="CSRéf">CSRéf</option>
                  <option value="CSCom">CSCom</option>
                </select>
              </Field>
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
              <Field label="Statut">
                <select
                  className={inputClass}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="attente">En attente</option>
                  <option value="consultation">En consultation</option>
                  <option value="traite">Traité</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Contact et prise en charge</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Constantes et anthropométrie</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Tension artérielle">
                <input
                  className={inputClass}
                  placeholder="118/76"
                  value={tensionArterielle}
                  onChange={(e) => setTensionArterielle(e.target.value)}
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
              <Field label="P/T — statut nutritionnel">
                <input
                  className={inputClass}
                  placeholder="Ex: Normal, Modérée, Sévère…"
                  value={statutPT}
                  onChange={(e) => setStatutPT(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Tests de laboratoire (paludisme)</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="TDR — Test de Diagnostic Rapide">
                <select className={inputClass} value={tdr} onChange={(e) => setTdr(e.target.value)}>
                  <option value="">Non fait</option>
                  <option value="Positif">Positif</option>
                  <option value="Négatif">Négatif</option>
                </select>
              </Field>
              <Field label="GE — Goutte Épaisse">
                <select className={inputClass} value={ge} onChange={(e) => setGe(e.target.value)}>
                  <option value="">Non fait</option>
                  <option value="Positif">Positif</option>
                  <option value="Négatif">Négatif</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Diagnostic et traitement</h2>
            <div className="grid grid-cols-1 gap-4">
              <Field label="Signes">
                <textarea
                  className={inputClass}
                  rows={2}
                  placeholder="Signes cliniques relevés (registre CSCom)"
                  value={signes}
                  onChange={(e) => setSignes(e.target.value)}
                />
              </Field>
              <Field label="Diagnostic">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={diagnostic}
                  onChange={(e) => setDiagnostic(e.target.value)}
                />
              </Field>
              <Field label="Traitement prescrit">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={traitementPrescrit}
                  onChange={(e) => setTraitementPrescrit(e.target.value)}
                />
              </Field>
              <Field label="Code affection (RMA)" required>
                <select
                  className={inputClass}
                  value={codeAffection}
                  required
                  onChange={(e) => {
                    setCodeAffection(e.target.value);
                    const hasDeces =
                      MORBIDITE_AFFECTIONS.find((a) => a.label === e.target.value)?.hasDeces ??
                      false;
                    if (!hasDeces) setDeces(false);
                  }}
                >
                  <option value="" disabled>
                    Sélectionner une affection…
                  </option>
                  {MORBIDITE_AFFECTIONS.map((a) => (
                    <option key={a.label} value={a.label}>
                      {a.code} — {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              {codeAffection && selectedAffectionHasDeces && (
                <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                  <input
                    type="checkbox"
                    checked={deces}
                    onChange={(e) => setDeces(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e1e0d9]"
                  />
                  Décès (issue de cette consultation, imputé à cette affection)
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-[#0b0b0b]">
                <input
                  type="checkbox"
                  checked={mdo}
                  onChange={(e) => setMdo(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e1e0d9]"
                />
                Maladie à déclaration obligatoire (MDO)
              </label>
              {mdo && (
                <Field label="Nom de la maladie" required>
                  <input
                    className={inputClass}
                    placeholder="Ex: Rougeole, Méningite…"
                    value={mdoMaladie}
                    onChange={(e) => setMdoMaladie(e.target.value)}
                    required
                  />
                </Field>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
