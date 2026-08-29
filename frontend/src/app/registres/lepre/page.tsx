'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useClinicName } from '@/lib/useClinicName';
import { useToast } from '@/contexts/ToastContext';
import { MonthPicker } from '@/components/MonthPicker';
import { downloadRegisterPdf } from '@/lib/exportPdf';

// RMA section 5 — "Prise en charge Lèpre" (juste avant Dracunculose et
// Paludisme dans le RMA officiel). Comme le registre Hygiène, il n'y a pas
// de journal par patient : un seul enregistrement par mois, saisi
// manuellement par le personnel (cohorte PB/MB en début/fin de période,
// nouveaux cas, fermetures de fiche, infirmités, ruptures de médicaments).
// Même 27 clés que frontend/src/app/api/registres/lepre/route.ts
// (LEPRE_FIELD_KEYS) et le modèle Prisma LepreRapport — dupliquées ici pour
// l'affichage groupé par sous-partie, même précédent que HYGIENE_GROUPS.
const LEPRE_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: 'Malades en traitement au début de la période',
    fields: [
      { key: 'nbMaladesTraitementDebutPeriode', label: 'Nombre de malades en traitement' },
      { key: 'nbMaladesTraitementDebutPeriodePB', label: 'Dont lèpre Pauci Bacillaire (PB)' },
      { key: 'nbMaladesTraitementDebutPeriodeMB', label: 'Dont lèpre Multi Bacillaire (MB)' },
    ],
  },
  {
    title: "Nouveaux cas pris en charge (ouverture d'une fiche)",
    fields: [
      { key: 'nbNouveauxCasPrisEnCharge', label: 'Nombre de malades pris en charge' },
      { key: 'nbNouveauxCasPB', label: 'Nouveau cas lèpre PB' },
      { key: 'nbNouveauxCasMB', label: 'Nouveau cas lèpre MB' },
      {
        key: 'nbNouveauxCasEnfantsMoins15Ans',
        label: 'Nouveau cas lèpre PB et MB chez les enfants de moins de 15 ans',
      },
      { key: 'nbMutilationNouveauxCasPB', label: 'Dont mutilation chez nouveau cas PB' },
      { key: 'nbMutilationNouveauxCasMB', label: 'Dont mutilation chez nouveau cas MB' },
      { key: 'nbAutresCasRecusPB', label: 'Autres cas (ancien cas, transfert) PB reçus' },
      { key: 'nbAutresCasRecusMB', label: 'Autres cas (ancien cas, transfert) MB reçus' },
    ],
  },
  {
    title: "Traitements arrêtés (fermeture d'une fiche)",
    fields: [
      { key: 'nbTraitementsArretes', label: 'Nombre de traitements arrêtés' },
      { key: 'nbGuerisonPB', label: 'Guérison PB' },
      { key: 'nbGuerisonMB', label: 'Guérison MB' },
      { key: 'nbDecesPB', label: 'Décès PB' },
      { key: 'nbDecesMB', label: 'Décès MB' },
      {
        key: 'nbTransfertAutreFormationPB',
        label: 'Transfert vers une autre formation sanitaire PB',
      },
      {
        key: 'nbTransfertAutreFormationMB',
        label: 'Transfert vers une autre formation sanitaire MB',
      },
      { key: 'nbPerdusDeVuePB', label: 'Perdus de vue PB' },
      { key: 'nbPerdusDeVueMB', label: 'Perdus de vue MB' },
    ],
  },
  {
    title: 'Malades à la fin de la période',
    fields: [
      { key: 'nbMaladesFinPeriode', label: 'Nombre de malades' },
      { key: 'nbMaladesFinPeriodePB', label: 'Dont lèpre Pauci Bacillaire (PB)' },
      { key: 'nbMaladesFinPeriodeMB', label: 'Dont lèpre Multi Bacillaire (MB)' },
    ],
  },
  {
    title: 'Infirmités et ruptures de stock',
    fields: [
      {
        key: 'nbNouvellesInfirmitesDurantTraitement',
        label: 'Malades ayant développé de nouvelles infirmités durant le traitement',
      },
      {
        key: 'nbNouveauCasInfirmiteDegre2',
        label: 'Nouveau cas de lèpre avec infirmité de degré 2',
      },
      { key: 'nbJoursRuptureMedicamentsPB', label: 'Jours de rupture des médicaments PB' },
      { key: 'nbJoursRuptureMedicamentsMB', label: 'Jours de rupture des médicaments MB' },
    ],
  },
];

interface ClosureStatus {
  month: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [yearStr, monthStr] = month.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RegistreLeprePage() {
  const clinicName = useClinicName();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [values, setValues] = useState<Record<string, string>>({});
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const [closureRes, rapport] = await Promise.all([
        api<ClosureStatus>(`/api/registres/lepre/closure?month=${selectedMonth}`),
        api<Record<string, number | string | null>>(`/api/registres/lepre?month=${selectedMonth}`),
      ]);
      setClosure(closureRes);
      const next: Record<string, string> = {};
      for (const group of LEPRE_GROUPS) {
        for (const f of group.fields) {
          const v = rapport[f.key];
          next[f.key] = typeof v === 'number' ? String(v) : '';
        }
      }
      setValues(next);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | number> = { month };
      for (const group of LEPRE_GROUPS) {
        for (const f of group.fields) {
          const raw = values[f.key];
          if (raw !== undefined && raw !== '') body[f.key] = Number(raw);
        }
      }
      await api('/api/registres/lepre', { method: 'PUT', body });
      toast('Indicateurs enregistrés.');
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setSaving(false);
    }
  }

  async function onClose() {
    if (
      !window.confirm(
        `Clôturer le registre Lèpre de ${month} ? Les indicateurs ne pourront plus être modifiés pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/lepre/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  function downloadPdf() {
    const headers = ['Indicateur', 'Valeur'];
    const rows: string[][] = [];
    for (const group of LEPRE_GROUPS) {
      rows.push([group.title, '']);
      for (const f of group.fields) {
        rows.push([f.label, values[f.key] || '—']);
      }
    }
    downloadRegisterPdf({
      title: 'Registre Lèpre — Prise en charge Lèpre',
      clinicName,
      month,
      headers,
      rows,
      fileName: `registre-lepre-${month}.pdf`,
    });
  }

  const disabled = loading || saving || closure?.closed === true;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre Lèpre</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href="/registres/rma/csref"
              className="mt-1 inline-block text-xs text-[#2a78d6] hover:underline"
            >
              Aide à la saisie RMA →
            </Link>
            <p className="mt-1 text-xs text-[#898781]">
              Section 5 du RMA (Prise en charge Lèpre) — saisie manuelle mensuelle de la cohorte de
              malades PB/MB (pas de lien avec les dossiers patients).
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mois précédent"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ‹
              </button>
              <MonthPicker value={month} onChange={setMonth} />
              <button
                type="button"
                aria-label="Mois suivant"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7]"
            >
              Télécharger PDF
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b] print:hidden"
          >
            {error}
          </p>
        )}

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:flex-row sm:items-center sm:justify-between">
          {closure?.closed ? (
            <p className="text-sm text-[#0ca30c]">
              ✓ Clôturé le {closure.closedAt && formatDateTime(closure.closedAt)}
              {closure.closedByName ? ` par ${closure.closedByName}` : ''}
            </p>
          ) : (
            <p className="text-sm text-[#52514e]">Registre ouvert — modifiable</p>
          )}
          <div className="flex gap-3">
            {!closure?.closed && (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={disabled}
                  className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf] disabled:opacity-50 print:hidden"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={closing || loading}
                  className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50 print:hidden"
                >
                  {closing ? 'Clôture…' : 'Clôturer le mois'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {LEPRE_GROUPS.map((group) => (
            <div
              key={group.title}
              className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
            >
              <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
                {group.title}
              </h2>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-xs text-[#52514e]">{f.label}</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={disabled}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
