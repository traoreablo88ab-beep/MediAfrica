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

// RMA section 4 — "Activités de laboratoire et transfusion". Comme les
// registres Lèpre/Hygiène, il n'y a pas de journal par patient : un seul
// enregistrement par mois, saisi manuellement (colonnes Total + Positif/
// Anormal par examen, sauf Transfusion — valeur unique). Les groupes
// Imagerie médicale et Anesthésie sont propres au 2ème échelon/CSRéf — le
// 1er échelon/CSCom les laisse simplement vides. Même 84 clés que
// frontend/src/app/api/registres/laboratoire/route.ts
// (LABORATOIRE_FIELD_KEYS) et le modèle Prisma LaboratoireRapport —
// dupliquées ici pour l'affichage groupé, même précédent que LEPRE_GROUPS.
const LABORATOIRE_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: 'Hématologie',
    fields: [
      { key: 'nfsTotal', label: 'NFS — Total' },
      { key: 'nfsPositif', label: 'NFS — Positif' },
      { key: 'vsTotal', label: 'VS — Total' },
      { key: 'vsPositif', label: 'VS — Positif' },
      { key: 'tsTotal', label: 'TS — Total' },
      { key: 'tsPositif', label: 'TS — Positif' },
      { key: 'tcTotal', label: 'TC — Total' },
      { key: 'tcPositif', label: 'TC — Positif' },
      { key: 'teTotal', label: 'T.E. — Total' },
      { key: 'tePositif', label: 'T.E. — Positif' },
      { key: 'groupeAboTotal', label: 'Groupe ABO — Total' },
      { key: 'groupeAboPositif', label: 'Groupe ABO — Positif' },
      { key: 'rhesusDTotal', label: 'Rhésus D — Total' },
      { key: 'rhesusDPositif', label: 'Rhésus D — Positif' },
    ],
  },
  {
    title: 'Sérologie',
    fields: [
      { key: 'hbsTotal', label: 'HBS — Total' },
      { key: 'hbsPositif', label: 'HBS — Positif' },
      { key: 'bwTotal', label: 'B.W. — Total' },
      { key: 'bwPositif', label: 'B.W. — Positif' },
      { key: 'widalTotal', label: 'Widal — Total' },
      { key: 'widalPositif', label: 'Widal — Positif' },
      { key: 'vihTotal', label: 'VIH — Total' },
      { key: 'vihPositif', label: 'VIH — Positif' },
      { key: 'transfusionPocheTesteeTotal', label: 'Transfusion (poche testée) — Total' },
      { key: 'transfusionPocheTesteePositif', label: 'Transfusion (poche testée) — Positif' },
      { key: 'testGrossesseTotal', label: 'Test de grossesse — Total' },
      { key: 'testGrossessePositif', label: 'Test de grossesse — Positif' },
    ],
  },
  {
    title: 'Biochimie',
    fields: [
      { key: 'glycemieTotal', label: 'Glycémie — Total' },
      { key: 'glycemieAnormal', label: 'Glycémie — Anormal' },
      { key: 'albumineTotal', label: 'Albumine — Total' },
      { key: 'albumineAnormal', label: 'Albumine — Anormal' },
      { key: 'sucreTotal', label: 'Sucre — Total' },
      { key: 'sucreAnormal', label: 'Sucre — Anormal' },
      { key: 'creatinemieTotal', label: 'Créatinémie — Total' },
      { key: 'creatinemieAnormal', label: 'Créatinémie — Anormal' },
      { key: 'transaminasesTotal', label: 'Transaminases — Total' },
      { key: 'transaminasesAnormal', label: 'Transaminases — Anormal' },
      { key: 'cholesterolemieTotal', label: 'Cholestérolémie — Total' },
      { key: 'cholesterolemieAnormal', label: 'Cholestérolémie — Anormal' },
      { key: 'asloTotal', label: 'ASLO — Total' },
      { key: 'asloAnormal', label: 'ASLO — Anormal' },
      { key: 'serologieToxoTotal', label: 'Sérologie toxoplasmose — Total' },
      { key: 'serologieToxoAnormal', label: 'Sérologie toxoplasmose — Anormal' },
      { key: 'serologieRubeoleTotal', label: 'Sérologie de la rubéole — Total' },
      { key: 'serologieRubeoleAnormal', label: 'Sérologie de la rubéole — Anormal' },
      { key: 'autresBiochimiesTotal', label: 'Autres biochimies — Total' },
      { key: 'autresBiochimiesAnormal', label: 'Autres biochimies — Anormal' },
    ],
  },
  {
    title: 'Bactériologie',
    fields: [
      { key: 'lcrTotal', label: 'LCR — Total' },
      { key: 'lcrPositif', label: 'LCR — Positif' },
      { key: 'bkTotal', label: 'B.K. — Total' },
      { key: 'bkPositif', label: 'B.K. — Positif' },
      { key: 'ecbuTotal', label: 'ECBU — Total' },
      { key: 'ecbuPositif', label: 'ECBU — Positif' },
      { key: 'pvGramTotal', label: 'PV (coloration Gram) — Total' },
      { key: 'pvGramPositif', label: 'PV (coloration Gram) — Positif' },
      { key: 'puGramTotal', label: 'PU (coloration Gram) — Total' },
      { key: 'puGramPositif', label: 'PU (coloration Gram) — Positif' },
      { key: 'autreBacterioTotal', label: 'Autre bactériologie — Total' },
      { key: 'autreBacterioPositif', label: 'Autre bactériologie — Positif' },
    ],
  },
  {
    title: 'Parasitologie',
    fields: [
      { key: 'geFrottisTotal', label: 'G.E. / Frottis mince — Total' },
      { key: 'geFrottisPositif', label: 'G.E. / Frottis mince — Positif' },
      { key: 'tdrTotal', label: 'TDR — Total' },
      { key: 'tdrPositif', label: 'TDR — Positif' },
      { key: 'culotUrinaireTotal', label: 'Culot urinaire — Total' },
      { key: 'culotUrinairePositif', label: 'Culot urinaire — Positif' },
      { key: 'pokDirectTotal', label: 'P.O.K. (examen direct) — Total' },
      { key: 'pokDirectPositif', label: 'P.O.K. (examen direct) — Positif' },
      { key: 'pokKatoTotal', label: 'P.O.K. (Kato) — Total' },
      { key: 'pokKatoPositif', label: 'P.O.K. (Kato) — Positif' },
      { key: 'rechSchistoTotal', label: 'Rech. Schisto/urines — Total' },
      { key: 'rechSchistoPositif', label: 'Rech. Schisto/urines — Positif' },
      { key: 'pvDirectTotal', label: 'PV (examen direct) — Total' },
      { key: 'pvDirectPositif', label: 'PV (examen direct) — Positif' },
      { key: 'puDirectTotal', label: 'PU (examen direct) — Total' },
      { key: 'puDirectPositif', label: 'PU (examen direct) — Positif' },
      { key: 'rechMicrofilairesTotal', label: 'Rech. microfilaires — Total' },
      { key: 'rechMicrofilairesPositif', label: 'Rech. microfilaires — Positif' },
    ],
  },
  {
    title: 'Transfusion',
    fields: [
      { key: 'nbPochesDisponibles', label: 'Nombre de poches disponibles' },
      { key: 'nbPatientsTransfuses', label: 'Nombre de patients transfusés' },
    ],
  },
  {
    title: 'Imagerie médicale (2ème échelon / CSRéf uniquement)',
    fields: [
      { key: 'nbGraphiesRealisees', label: 'Graphies réalisées' },
      { key: 'nbEchographiesRealisees', label: "Nombre d'échographies réalisées" },
      { key: 'imagerieAutres', label: 'Autres' },
    ],
  },
  {
    title: 'Anesthésie (2ème échelon / CSRéf uniquement)',
    fields: [
      { key: 'anesthesieLocale', label: 'Locale' },
      { key: 'anesthesieLocoRegionale', label: 'Loco-régionale' },
      { key: 'anesthesieGenerale', label: 'Générale' },
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

export default function RegistreLaboratoirePage() {
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
        api<ClosureStatus>(`/api/registres/laboratoire/closure?month=${selectedMonth}`),
        api<Record<string, number | string | null>>(
          `/api/registres/laboratoire?month=${selectedMonth}`,
        ),
      ]);
      setClosure(closureRes);
      const next: Record<string, string> = {};
      for (const group of LABORATOIRE_GROUPS) {
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
      for (const group of LABORATOIRE_GROUPS) {
        for (const f of group.fields) {
          const raw = values[f.key];
          if (raw !== undefined && raw !== '') body[f.key] = Number(raw);
        }
      }
      await api('/api/registres/laboratoire', { method: 'PUT', body });
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
        `Clôturer le registre Laboratoire de ${month} ? Les indicateurs ne pourront plus être modifiés pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/laboratoire/close', { method: 'POST', body: { month } });
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
    for (const group of LABORATOIRE_GROUPS) {
      rows.push([group.title, '']);
      for (const f of group.fields) {
        rows.push([f.label, values[f.key] || '—']);
      }
    }
    downloadRegisterPdf({
      title: 'Registre Laboratoire — Activités de laboratoire et transfusion',
      clinicName,
      month,
      headers,
      rows,
      fileName: `registre-laboratoire-${month}.pdf`,
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
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre Laboratoire</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href="/registres/rma/csref"
              className="mt-1 inline-block text-xs text-[#2a78d6] hover:underline"
            >
              Aide à la saisie RMA →
            </Link>
            <p className="mt-1 text-xs text-[#898781]">
              Section 4 du RMA (Activités de laboratoire et transfusion) — saisie manuelle mensuelle
              (pas de lien avec les dossiers patients).
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
          {LABORATOIRE_GROUPS.map((group) => (
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
