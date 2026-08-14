'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface NutritionSummary {
  id: string;
  date: string;
  type: string;
}

interface PatientSummary {
  nom: string;
  prenom: string;
  nutritions: NutritionSummary[];
}

type EvenementType = 'VAD' | 'REFERENCE_TRANSFERT';

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

const TYPE_LABEL: Record<EvenementType, string> = {
  VAD: 'Visite à domicile (VAD)',
  REFERENCE_TRANSFERT: 'Référence / transfert',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayLocalDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export default function NutritionEvenementPage() {
  const params = useParams<{ id: string; nutritionId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [record, setRecord] = useState<NutritionSummary | null>(null);

  const [type, setType] = useState<EvenementType>('VAD');
  const [date, setDate] = useState(todayLocalDate());
  const [raison, setRaison] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [centre, setCentre] = useState('');
  const [resultat, setResultat] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PatientSummary>(`/api/patients/${params.id}`)
      .then((p) => {
        if (cancelled) return;
        setPatientName(`${p.nom}, ${p.prenom}`);
        const found = p.nutritions.find((n) => n.id === params.nutritionId) ?? null;
        if (found && found.type !== 'URENAS') {
          setLoadError('Seules les fiches URENAS suivent des VAD/transferts.');
        } else {
          setRecord(found);
          if (!found) setLoadError('Fiche introuvable.');
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(friendlyError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, params.nutritionId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = {
      type,
      date: new Date(date).toISOString(),
      ...(raison ? { raison } : {}),
      ...(type === 'VAD' && conclusion ? { conclusion } : {}),
      ...(type === 'REFERENCE_TRANSFERT' && centre ? { centre } : {}),
      ...(type === 'REFERENCE_TRANSFERT' && resultat ? { resultat } : {}),
    };

    try {
      await api(`/api/nutritions/${params.nutritionId}/evenements`, { method: 'POST', body });
      toast('Évènement enregistré avec succès.');
      router.push(`/patients/${params.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'REGISTER_CLOSED'
          ? 'Le registre du mois d’admission est déjà clôturé — impossible d’ajouter un évènement.'
          : friendlyError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="registres" />
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  if (loadError || !record) {
    return (
      <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
        <AppHeader active="registres" />
        <div className="flex min-h-[calc(100vh-61px)] items-center justify-center px-6">
          <p role="alert" className="rounded-md bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]">
            {loadError ?? 'Fiche introuvable.'}
          </p>
        </div>
      </main>
    );
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
          / Ajouter un évènement
        </p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">
              Nouvel évènement — VAD / transfert
            </h1>
            <p className="mt-1 text-sm text-[#52514e]">
              URENAS — admis(e) le {formatDate(record.date)}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/patients/${params.id}`}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-center text-sm font-medium text-[#0b0b0b] hover:bg-[#f9f9f7]"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form="nutrition-evenement-form"
              disabled={submitting}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : '✓ Enregistrer l’évènement'}
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

        <form id="nutrition-evenement-form" onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#e1e0d9] bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Type d&apos;évènement</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['VAD', 'REFERENCE_TRANSFERT'] as EvenementType[]).map((t) => (
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
            <h2 className="mb-4 font-semibold text-[#0b0b0b]">Détails</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Date et heure" required>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Raison">
                  <input
                    className={inputClass}
                    placeholder={type === 'VAD' ? 'Ex: Non retour, absence…' : 'Ex: Complications…'}
                    value={raison}
                    onChange={(e) => setRaison(e.target.value)}
                  />
                </Field>
              </div>
              {type === 'VAD' ? (
                <div className="sm:col-span-3">
                  <Field label="Conclusion">
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={conclusion}
                      onChange={(e) => setConclusion(e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <Field label="Centre de référence">
                    <input
                      className={inputClass}
                      value={centre}
                      onChange={(e) => setCentre(e.target.value)}
                    />
                  </Field>
                  <Field label="Résultat">
                    <input
                      className={inputClass}
                      value={resultat}
                      onChange={(e) => setResultat(e.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
