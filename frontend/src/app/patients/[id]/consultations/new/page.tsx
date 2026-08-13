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

export default function NewConsultationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patientName, setPatientName] = useState<string | null>(null);

  const [motif, setMotif] = useState('');
  const [typeCas, setTypeCas] = useState('');
  const [status, setStatus] = useState('attente');
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
    const url = `/api/patients/${params.id}/consultations`;
    const body = {
      motif,
      ...(typeCas ? { typeCas } : {}),
      status,
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
