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

const REGISTER_COLUMN_COUNT = 14;

interface NutritionRow {
  id: string;
  date: string;
  typeCas: string | null;
  poidsKg: number | null;
  tailleCm: number | null;
  perimetreBrachialCm: number | null;
  oedemes: string | null;
  classification: string | null;
  testAppetit: string | null;
  priseEnCharge: string | null;
  numeroVisiteSuivi: number | null;
  evolution: string | null;
  prochainRdv: string | null;
  observations: string | null;
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

function buildRegisterRows(rows: NutritionRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'Date',
    'N° dossier',
    'Nom et prénom',
    'Âge',
    'Sexe',
    'PB (cm)',
    'Œdèmes',
    'Classification',
    'Test appétit',
    'Prise en charge',
    'N° visite',
    'Évolution',
    'Soignant',
  ];
  const lines = rows.map((n, i) => [
    String(i + 1),
    formatDate(n.date),
    n.patient.dossierNumber,
    `${n.patient.nom}, ${n.patient.prenom}`,
    String(computeAge(n.patient.dateNaissance)),
    n.patient.sexe,
    n.perimetreBrachialCm != null ? String(n.perimetreBrachialCm) : '',
    n.oedemes ?? '',
    n.classification ?? '',
    n.testAppetit ?? '',
    n.priseEnCharge ?? '',
    n.numeroVisiteSuivi != null ? String(n.numeroVisiteSuivi) : '',
    n.evolution ?? '',
    n.providerName ?? '',
  ]);
  return { headers, lines };
}

// Semicolon delimiter + UTF-8 BOM — the format Excel with a French locale
// expects (comma is the decimal separator there, so it can't be the
// column separator; the BOM keeps accented names/text readable).
function downloadCsv(month: string, rows: NutritionRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-nutrition-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(clinicName: string, month: string, rows: NutritionRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: 'Registre de nutrition (PCIMA)',
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-nutrition-${month}.pdf`,
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

export default function RegistreNutritionPage() {
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
        `/api/registres/nutrition/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: NutritionRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ dateFrom, dateTo, limit: '50' });
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
        `Clôturer le registre de ${month} ? Aucune fiche nutrition ne pourra plus être ajoutée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/nutrition/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  const classificationCounts = new Map<string, number>();
  for (const n of items) {
    const key = n.classification?.trim() || 'Non précisé';
    classificationCounts.set(key, (classificationCounts.get(key) ?? 0) + 1);
  }
  const masCount = items.filter((n) => n.classification?.startsWith('MAS')).length;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre de nutrition (PCIMA)</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
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

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Total fiches
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
            <p className="mt-1 text-xs text-[#898781]">{masCount} cas MAS ce mois-ci</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Répartition par classification
            </p>
            {classificationCounts.size === 0 ? (
              <p className="mt-1 text-sm text-[#52514e]">Aucune fiche ce mois-ci.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {[...classificationCounts.entries()].map(([classification, count]) => (
                  <li
                    key={classification}
                    className="rounded-full bg-[#2a78d6]/10 px-3 py-1 text-xs font-medium text-[#2a78d6]"
                  >
                    {classification} × {count}
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
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">N° dossier</th>
                <th className="px-3 py-2 font-medium">Nom et prénom</th>
                <th className="px-3 py-2 font-medium">Âge</th>
                <th className="px-3 py-2 font-medium">Sexe</th>
                <th className="px-3 py-2 font-medium">PB</th>
                <th className="px-3 py-2 font-medium">Œdèmes</th>
                <th className="px-3 py-2 font-medium">Classification</th>
                <th className="px-3 py-2 font-medium">Test appétit</th>
                <th className="px-3 py-2 font-medium">Prise en charge</th>
                <th className="px-3 py-2 font-medium">N° visite</th>
                <th className="px-3 py-2 font-medium">Évolution</th>
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
              {items.map((n, i) => (
                <tr
                  key={n.id}
                  className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-3 py-2 text-[#898781]">{i + 1}</td>
                  <td className="px-3 py-2 text-[#52514e]">{formatDate(n.date)}</td>
                  <td className="px-3 py-2 text-[#898781]">
                    <Link href={`/patients/${n.patient.id}`} className="hover:underline">
                      {n.patient.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                    {n.patient.nom}, {n.patient.prenom}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {computeAge(n.patient.dateNaissance)}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{n.patient.sexe === 'F' ? 'F' : 'M'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.perimetreBrachialCm ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.oedemes ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.classification ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.testAppetit ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.priseEnCharge ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.numeroVisiteSuivi ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.evolution ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{n.providerName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucune fiche nutrition ce mois-ci.
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
