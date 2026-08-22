'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';
import { MonthPicker } from '@/components/MonthPicker';
import { downloadRegisterPdf } from '@/lib/exportPdf';
import { useToast } from '@/contexts/ToastContext';

// Registre CSCom — même modèle de registre que /registres/consultation (même
// table Consultation, même clôture mensuelle "consultation"), filtré aux
// consultations taguées echelon="CSCom" à la saisie (voir Field "Structure
// (échelon)" sur le formulaire de nouvelle consultation) — celles taguées
// "CSRéf" (ou non taguées, legacy) vivent sur /registres/consultation. Ajoute
// aussi la colonne "Signes" du registre papier CSCom (1er échelon), affichée
// juste avant Diagnostic. Toute autre colonne/logique est dupliquée à
// l'identique depuis registres/consultation/page.tsx.
const REGISTER_COLUMN_COUNT = 28;

// 73 affections officielles du RMA (section 7, rapport de morbidité et de
// mortalité) — même liste que MORBIDITE_AFFECTIONS sur le formulaire de
// nouvelle consultation et sur /registres/consultation, dupliquée ici pour
// permettre de coder — ou recoder — n'importe quelle consultation déjà
// enregistrée directement depuis le registre.
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

function affectionHasDeces(label: string | null): boolean {
  if (!label) return false;
  return MORBIDITE_AFFECTIONS.find((a) => a.label === label)?.hasDeces ?? false;
}

interface ConsultationRow {
  id: string;
  date: string;
  motif: string;
  status: string;
  echelon: string | null;
  signes: string | null;
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
  codeAffection: string | null;
  deces: boolean | null;
  patient: {
    id: string;
    nom: string;
    prenom: string;
    dossierNumber: string;
    dateNaissance: string;
    sexe: string;
    communeResidence: string;
  };
  providerName: string | null;
}

interface ConsultationsPage {
  items: ConsultationRow[];
  nextCursor: string | null;
}

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

function monthBounds(month: string): { dateFrom: string; dateTo: string } {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const lastDay = new Date(year, monthNum, 0).getDate();
  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

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

function csvEscape(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildRegisterRows(rows: ConsultationRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'Date',
    'N° dossier',
    'Nom et prénom',
    'Âge',
    'Sexe',
    'Provenance',
    'Téléphone',
    'Localisation',
    'Motif',
    'NC',
    'AC',
    'Signes',
    'Diagnostic',
    'TDR',
    'GE',
    'Poids (kg)',
    'Taille (cm)',
    'PB (cm)',
    'P/T',
    'MDO',
    'Code affection (RMA)',
    'Décès',
    'Indigent (Oui)',
    'Indigent (Non)',
    'Traitement',
    'Soignant',
  ];
  const lines = rows.map((c, i) => [
    String(i + 1),
    formatDate(c.date),
    c.patient.dossierNumber,
    `${c.patient.nom}, ${c.patient.prenom}`,
    String(computeAge(c.patient.dateNaissance)),
    c.patient.sexe,
    c.patient.communeResidence,
    c.telephoneContact ?? '',
    c.localisationPrecise ?? '',
    c.motif,
    c.typeCas === 'NC' ? 'X' : '',
    c.typeCas === 'AC' ? 'X' : '',
    c.signes ?? '',
    c.diagnostic ?? '',
    c.tdr ?? '',
    c.ge ?? '',
    c.poidsKg != null ? String(c.poidsKg) : '',
    c.tailleCm != null ? String(c.tailleCm) : '',
    c.perimetreBrachialCm != null ? String(c.perimetreBrachialCm) : '',
    c.statutPT ?? '',
    c.mdo ? (c.mdoMaladie ?? 'Oui') : '',
    c.codeAffection ?? '',
    c.deces === true ? 'X' : '',
    c.indigent === true ? 'X' : '',
    c.indigent === false ? 'X' : '',
    c.traitementPrescrit ?? '',
    c.providerName ?? '',
  ]);
  return { headers, lines };
}

// Semicolon delimiter + UTF-8 BOM — the format Excel with a French locale
// expects (comma is the decimal separator there, so it can't be the
// column separator; the BOM keeps accented names/text readable).
function downloadCsv(month: string, rows: ConsultationRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-cscom-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(clinicName: string, month: string, rows: ConsultationRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: 'Registre CSCom',
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-cscom-${month}.pdf`,
  });
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

export default function RegistreCSComPage() {
  const clinicName = useClinicName();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<ConsultationRow[]>([]);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingIndigentIds, setSavingIndigentIds] = useState<Set<string>>(new Set());
  const [savingMorbiditeIds, setSavingMorbiditeIds] = useState<Set<string>>(new Set());
  const [savingEchelonIds, setSavingEchelonIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      // Même clôture que /registres/consultation ("consultation") — c'est le
      // même registre sous-jacent, seule la mise en forme des colonnes diffère.
      const closureRes = await api<ClosureStatus>(
        `/api/registres/consultation/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: ConsultationRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ dateFrom, dateTo, limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const page: ConsultationsPage = await api<ConsultationsPage>(
          `/api/consultations?${params.toString()}`,
        );
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      // This register only shows explicitly CSCom-tagged consultations —
      // CSRéf (or untagged, legacy) rows live on /registres/consultation.
      const cscom = all.filter((c) => c.echelon === 'CSCom');
      cscom.sort((a, b) => a.date.localeCompare(b.date));
      setItems(cscom);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  async function onClose() {
    if (
      !window.confirm(
        `Clôturer le registre de ${month} ? Aucune consultation ne pourra plus être ajoutée ou modifiée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/consultation/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  async function toggleIndigent(id: string, value: boolean) {
    const previous = items.find((c) => c.id === id)?.indigent ?? null;
    if (previous === value) return;
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, indigent: value } : c)));
    setSavingIndigentIds((prev) => new Set(prev).add(id));
    try {
      await api(`/api/consultations/${id}`, { method: 'PATCH', body: { indigent: value } });
    } catch (err) {
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, indigent: previous } : c)));
      toast(friendlyError(err, 'Une erreur est survenue. Réessayez.'), 'error');
    } finally {
      setSavingIndigentIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // This register only shows echelon === 'CSCom' rows — switching to CSRéf
  // moves the consultation to /registres/consultation, so it's removed from
  // this list rather than updated in place (mirrored on the CSRéf page).
  async function updateEchelon(id: string, newValue: string) {
    const current = items.find((c) => c.id === id);
    if (!current || current.echelon === newValue) return;
    const previousEchelon = current.echelon;
    const leavesRegister = newValue !== 'CSCom';

    if (leavesRegister) {
      setItems((prev) => prev.filter((c) => c.id !== id));
    } else {
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, echelon: newValue } : c)));
    }
    setSavingEchelonIds((prev) => new Set(prev).add(id));
    try {
      await api(`/api/consultations/${id}`, { method: 'PATCH', body: { echelon: newValue } });
    } catch (err) {
      if (leavesRegister) {
        setItems((prev) =>
          [...prev, { ...current, echelon: previousEchelon }].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        );
      } else {
        setItems((prev) => prev.map((c) => (c.id === id ? { ...c, echelon: previousEchelon } : c)));
      }
      toast(friendlyError(err, 'Une erreur est survenue. Réessayez.'), 'error');
    } finally {
      setSavingEchelonIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // newLabel === '' clears the coding ("— Aucun —"). Switching to an
  // affection without a Décès sub-row also resets deces to false — the
  // checkbox disappears, so a stale `true` could never be un-checked again.
  async function updateCodeAffection(id: string, newLabel: string) {
    const current = items.find((c) => c.id === id);
    if (!current) return;
    const previousCodeAffection = current.codeAffection;
    const previousDeces = current.deces;
    const nextCodeAffection = newLabel === '' ? null : newLabel;
    if (nextCodeAffection === previousCodeAffection) return;
    const nextDeces = affectionHasDeces(nextCodeAffection) ? previousDeces === true : false;

    setItems((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, codeAffection: nextCodeAffection, deces: nextDeces } : c,
      ),
    );
    setSavingMorbiditeIds((prev) => new Set(prev).add(id));
    try {
      await api(`/api/consultations/${id}`, {
        method: 'PATCH',
        body: { codeAffection: nextCodeAffection, deces: nextDeces },
      });
    } catch (err) {
      setItems((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, codeAffection: previousCodeAffection, deces: previousDeces } : c,
        ),
      );
      toast(friendlyError(err, 'Une erreur est survenue. Réessayez.'), 'error');
    } finally {
      setSavingMorbiditeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function toggleDeces(id: string, value: boolean) {
    const current = items.find((c) => c.id === id);
    if (!current || current.deces === value) return;
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, deces: value } : c)));
    setSavingMorbiditeIds((prev) => new Set(prev).add(id));
    try {
      await api(`/api/consultations/${id}`, { method: 'PATCH', body: { deces: value } });
    } catch (err) {
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, deces: current.deces } : c)));
      toast(friendlyError(err, 'Une erreur est survenue. Réessayez.'), 'error');
    } finally {
      setSavingMorbiditeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const totalNC = items.filter((c) => c.typeCas === 'NC').length;
  const totalAC = items.filter((c) => c.typeCas === 'AC').length;
  const indigentCount = items.filter((c) => c.indigent).length;
  const mdoCases = items.filter((c) => c.mdo);
  const mdoByMaladie = new Map<string, number>();
  for (const c of mdoCases) {
    const key = c.mdoMaladie?.trim() || 'Non précisé';
    mdoByMaladie.set(key, (mdoByMaladie.get(key) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre CSCom</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href="/registres/rma/cscom"
              className="mt-1 inline-block text-xs text-[#2a78d6] hover:underline"
            >
              Aide à la saisie RMA →
            </Link>
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
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => downloadCsv(month, items)}
                disabled={items.length === 0}
                className="flex-1 rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50 sm:flex-none"
              >
                Exporter CSV
              </button>
              <button
                type="button"
                onClick={() => downloadPdf(clinicName, month, items)}
                disabled={items.length === 0}
                className="flex-1 rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50 sm:flex-none"
              >
                Télécharger PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] sm:flex-none"
              >
                Imprimer
              </button>
            </div>
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

        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:flex-row sm:items-center sm:justify-between">
          {closure?.closed ? (
            <p className="text-sm text-[#0ca30c]">
              ✓ Clôturé le {closure.closedAt && formatDateTime(closure.closedAt)}
              {closure.closedByName ? ` par ${closure.closedByName}` : ''}
            </p>
          ) : (
            <p className="text-sm text-[#52514e]">Registre ouvert — modifiable</p>
          )}
          {!closure?.closed && (
            <button
              type="button"
              onClick={onClose}
              disabled={closing || loading}
              className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf] disabled:opacity-50 print:hidden"
            >
              {closing ? 'Clôture…' : 'Clôturer le mois'}
            </button>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Total consultations
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
            <p className="mt-1 text-xs text-[#898781]">
              {totalNC} nouveau{totalNC > 1 ? 'x' : ''} cas · {totalAC} ancien
              {totalAC > 1 ? 's' : ''} cas
            </p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Patients indigents
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#d03b3b]">{indigentCount}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Maladies à déclaration obligatoire
            </p>
            {mdoCases.length === 0 ? (
              <p className="mt-1 text-sm text-[#52514e]">Aucun cas ce mois-ci.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {[...mdoByMaladie.entries()].map(([maladie, count]) => (
                  <li
                    key={maladie}
                    className="rounded-full bg-[#d03b3b]/10 px-3 py-1 text-xs font-medium text-[#d03b3b]"
                  >
                    {maladie} × {count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  N°
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Date
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  N° dossier
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Nom et prénom
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Âge
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Sexe
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Provenance
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Téléphone
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Localisation
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Motif
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  NC
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  AC
                </th>
                <th
                  rowSpan={2}
                  className="border-l border-[#e1e0d9] px-3 py-2 align-bottom font-medium"
                >
                  Échelon
                </th>
                <th
                  rowSpan={2}
                  className="border-l border-[#e1e0d9] px-3 py-2 align-bottom font-medium"
                >
                  Signes
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Diagnostic
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  TDR
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  GE
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Poids
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Taille
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  PB
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  P/T
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  MDO
                </th>
                <th
                  rowSpan={2}
                  className="border-l border-[#e1e0d9] px-3 py-2 align-bottom font-medium"
                >
                  Code affection (RMA)
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Décès
                </th>
                <th
                  colSpan={2}
                  className="border-l border-[#e1e0d9] px-3 py-2 text-center font-medium"
                >
                  Indigent
                </th>
                <th
                  rowSpan={2}
                  className="border-l border-[#e1e0d9] px-3 py-2 align-bottom font-medium"
                >
                  Traitement
                </th>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Soignant
                </th>
              </tr>
              <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                <th className="border-l border-[#e1e0d9] px-2 py-1 text-center font-medium">Oui</th>
                <th className="px-2 py-1 text-center font-medium">Non</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                items.length === 0 &&
                Array.from({ length: 8 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-[#e1e0d9] last:border-0">
                    {Array.from({ length: REGISTER_COLUMN_COUNT }).map((_, colIndex) => (
                      <td key={colIndex} className="px-3 py-2">
                        <Skeleton className="h-3 w-10" />
                      </td>
                    ))}
                  </tr>
                ))}
              {items.map((c, i) => (
                <tr
                  key={c.id}
                  className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-3 py-2 text-[#898781]">{i + 1}</td>
                  <td className="px-3 py-2 text-[#52514e]">{formatDate(c.date)}</td>
                  <td className="px-3 py-2 text-[#898781]">
                    <Link href={`/patients/${c.patient.id}`} className="hover:underline">
                      {c.patient.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                    {c.patient.nom}, {c.patient.prenom}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {computeAge(c.patient.dateNaissance)}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{c.patient.sexe === 'F' ? 'F' : 'M'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.patient.communeResidence}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.telephoneContact ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.localisationPrecise ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.motif}</td>
                  <td className="px-3 py-2 text-center">{c.typeCas === 'NC' ? '✓' : ''}</td>
                  <td className="px-3 py-2 text-center">{c.typeCas === 'AC' ? '✓' : ''}</td>
                  <td className="border-l border-[#e1e0d9] px-2 py-2 text-[#52514e]">
                    <select
                      aria-label={`Échelon (${c.patient.nom} ${c.patient.prenom})`}
                      value={c.echelon ?? 'CSCom'}
                      disabled={closure?.closed || savingEchelonIds.has(c.id)}
                      onChange={(e) => updateEchelon(c.id, e.target.value)}
                      className="w-24 rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-[#e1e0d9] focus:border-[#2a78d6] focus:outline-none disabled:opacity-50"
                    >
                      <option value="CSRéf">CSRéf</option>
                      <option value="CSCom">CSCom</option>
                    </select>
                  </td>
                  <td className="border-l border-[#e1e0d9] px-3 py-2 text-[#52514e]">
                    {c.signes ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{c.diagnostic ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.tdr ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.ge ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.poidsKg ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.tailleCm ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.perimetreBrachialCm ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.statutPT ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {c.mdo ? (c.mdoMaladie ?? 'Oui') : '—'}
                  </td>
                  <td className="border-l border-[#e1e0d9] px-2 py-2 text-[#52514e]">
                    <select
                      aria-label={`Code affection RMA (${c.patient.nom} ${c.patient.prenom})`}
                      value={c.codeAffection ?? ''}
                      disabled={closure?.closed || savingMorbiditeIds.has(c.id)}
                      onChange={(e) => updateCodeAffection(c.id, e.target.value)}
                      className="w-44 rounded border border-transparent bg-transparent py-0.5 text-xs hover:border-[#e1e0d9] focus:border-[#2a78d6] focus:outline-none disabled:opacity-50"
                    >
                      <option value="">— Aucun —</option>
                      {MORBIDITE_AFFECTIONS.map((a) => (
                        <option key={a.label} value={a.label}>
                          {a.code} — {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {affectionHasDeces(c.codeAffection) ? (
                      <input
                        type="checkbox"
                        aria-label={`Décès (${c.patient.nom} ${c.patient.prenom})`}
                        checked={c.deces === true}
                        disabled={closure?.closed || savingMorbiditeIds.has(c.id)}
                        onChange={(e) => toggleDeces(c.id, e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#d03b3b] disabled:opacity-50"
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="border-l border-[#e1e0d9] px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Indigent — oui (${c.patient.nom} ${c.patient.prenom})`}
                      checked={c.indigent === true}
                      disabled={closure?.closed || savingIndigentIds.has(c.id)}
                      onChange={() => toggleIndigent(c.id, true)}
                      className="h-3.5 w-3.5 accent-[#d03b3b] disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Indigent — non (${c.patient.nom} ${c.patient.prenom})`}
                      checked={c.indigent === false}
                      disabled={closure?.closed || savingIndigentIds.has(c.id)}
                      onChange={() => toggleIndigent(c.id, false)}
                      className="h-3.5 w-3.5 accent-[#898781] disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{c.traitementPrescrit ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.providerName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucune consultation ce mois-ci.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
