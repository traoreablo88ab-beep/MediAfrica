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

const REGISTER_LABEL = 'Registre URENI';
const REGISTER_TYPE = 'URENI';
const REGISTER_COLUMN_COUNT = 15;

interface NutritionVisite {
  numeroVisite: number;
  date: string;
}

interface NutritionRow {
  id: string;
  date: string;
  numeroMas: string | null;
  ageMois: number | null;
  modeAdmission: string | null;
  poidsKg: number | null;
  tailleCm: number | null;
  perimetreBrachialCm: number | null;
  ptIndice: string | null;
  oedemes: string | null;
  dateSortie: string | null;
  typeSortie: string | null;
  visites: NutritionVisite[];
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

interface NutritionPage {
  items: NutritionRow[];
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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

function lastVisite(row: NutritionRow): NutritionVisite | null {
  return row.visites.length > 0 ? (row.visites[row.visites.length - 1] ?? null) : null;
}

function csvEscape(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildRegisterRows(rows: NutritionRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'N° MAS',
    "Date d'entrée",
    'N° dossier',
    'Nom et prénom',
    'Âge (mois)',
    'Sexe',
    'Mode admission',
    'Poids (kg)',
    'Taille (cm)',
    'PB (cm)',
    'P/T ou IMC',
    'Œdèmes',
    'Nb jours suivis',
    'Date de sortie',
    'Type de sortie',
    'Soignant',
  ];
  const lines = rows.map((n, i) => [
    String(i + 1),
    n.numeroMas ?? '',
    formatDate(n.date),
    n.patient.dossierNumber,
    `${n.patient.nom}, ${n.patient.prenom}`,
    n.ageMois != null ? String(n.ageMois) : '',
    n.patient.sexe,
    n.modeAdmission ?? '',
    n.poidsKg != null ? String(n.poidsKg) : '',
    n.tailleCm != null ? String(n.tailleCm) : '',
    n.perimetreBrachialCm != null ? String(n.perimetreBrachialCm) : '',
    n.ptIndice ?? '',
    n.oedemes ?? '',
    String(n.visites.length),
    n.dateSortie ? formatDate(n.dateSortie) : 'En cours',
    n.typeSortie ?? '',
    n.providerName ?? '',
  ]);
  return { headers, lines };
}

function downloadCsv(month: string, rows: NutritionRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-nutrition-ureni-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(clinicName: string, month: string, rows: NutritionRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: REGISTER_LABEL,
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-nutrition-ureni-${month}.pdf`,
  });
}

export default function RegistreNutritionUreniPage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<NutritionRow[]>([]);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const closureRes = await api<ClosureStatus>(
        `/api/registres/nutrition/ureni/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: NutritionRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          type: REGISTER_TYPE,
          dateFrom,
          dateTo,
          limit: '50',
        });
        if (cursor) params.set('cursor', cursor);
        const page: NutritionPage = await api<NutritionPage>(`/api/nutrition?${params.toString()}`);
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      all.sort((a, b) => a.date.localeCompare(b.date));
      setItems(all);
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
        `Clôturer le registre URENI de ${month} ? Aucune fiche ne pourra plus être ajoutée ou modifiée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/nutrition/ureni/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  const enCoursCount = items.filter((n) => !n.dateSortie).length;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">{REGISTER_LABEL}</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href="/registres/rma"
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

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Total admissions
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Toujours en cours
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#d08a1c]">{enCoursCount}</p>
          </div>
        </div>

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">N° MAS</th>
                <th className="px-3 py-2 font-medium">Date d&apos;entrée</th>
                <th className="px-3 py-2 font-medium">Nom et prénom</th>
                <th className="px-3 py-2 font-medium">Âge (mois)</th>
                <th className="px-3 py-2 font-medium">Sexe</th>
                <th className="px-3 py-2 font-medium">Mode admission</th>
                <th className="px-3 py-2 font-medium">Poids</th>
                <th className="px-3 py-2 font-medium">Taille</th>
                <th className="px-3 py-2 font-medium">PB</th>
                <th className="px-3 py-2 font-medium">P/T ou IMC</th>
                <th className="px-3 py-2 font-medium">Œd.</th>
                <th className="px-3 py-2 font-medium">Visites</th>
                <th className="px-3 py-2 font-medium">Date de sortie</th>
                <th className="px-3 py-2 font-medium">Soignant</th>
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
              {items.map((n, i) => {
                const last = lastVisite(n);
                return (
                  <tr
                    key={n.id}
                    className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                  >
                    <td className="px-3 py-2 text-[#898781]">{i + 1}</td>
                    <td className="px-3 py-2 text-[#898781]">{n.numeroMas ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">{formatDate(n.date)}</td>
                    <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                      <Link href={`/patients/${n.patient.id}`} className="hover:underline">
                        {n.patient.nom}, {n.patient.prenom}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[#52514e]">{n.ageMois ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">
                      {n.patient.sexe === 'F' ? 'F' : 'M'}
                    </td>
                    <td className="px-3 py-2 text-[#52514e]">{n.modeAdmission ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">{n.poidsKg ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">{n.tailleCm ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">{n.perimetreBrachialCm ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">{n.ptIndice ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">{n.oedemes ?? '—'}</td>
                    <td className="px-3 py-2 text-[#52514e]">
                      {n.visites.length > 0 ? (
                        <span title={last ? `Dernière : ${formatDate(last.date)}` : undefined}>
                          {n.visites.length} · {last ? formatDate(last.date) : '—'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {n.dateSortie ? (
                        <span className="text-[#52514e]">{formatDate(n.dateSortie)}</span>
                      ) : (
                        <span className="rounded-full bg-[#d08a1c]/10 px-2 py-0.5 text-xs font-medium text-[#d08a1c]">
                          En cours
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#52514e]">{n.providerName ?? '—'}</td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucune fiche URENI ce mois-ci.
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
