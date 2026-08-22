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

const REGISTER_COLUMN_COUNT = 9;

interface PFRow {
  id: string;
  date: string;
  typeVisite: string;
  methodeChoisie: string;
  quantiteRemise: string | null;
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

interface PFPage {
  items: PFRow[];
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

function buildRegisterRows(rows: PFRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'Date',
    'N° dossier',
    'Nom et prénom',
    'Âge',
    'Type de visite',
    'Méthode',
    'Quantité remise',
    'Soignant',
  ];
  const lines = rows.map((p, i) => [
    String(i + 1),
    formatDate(p.date),
    p.patient.dossierNumber,
    `${p.patient.nom}, ${p.patient.prenom}`,
    String(computeAge(p.patient.dateNaissance)),
    p.typeVisite,
    p.methodeChoisie,
    p.quantiteRemise ?? '',
    p.providerName ?? '',
  ]);
  return { headers, lines };
}

// Semicolon delimiter + UTF-8 BOM — the format Excel with a French locale
// expects (comma is the decimal separator there, so it can't be the
// column separator; the BOM keeps accented names/text readable).
function downloadCsv(month: string, rows: PFRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-planification-familiale-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(clinicName: string, month: string, rows: PFRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: 'Registre de planification familiale',
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-planification-familiale-${month}.pdf`,
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

export default function RegistrePlanificationFamilialePage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<PFRow[]>([]);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const closureRes = await api<ClosureStatus>(
        `/api/registres/planification-familiale/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: PFRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ dateFrom, dateTo, limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const page: PFPage = await api<PFPage>(`/api/planification-familiale?${params.toString()}`);
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
        `Clôturer le registre de ${month} ? Aucune visite ne pourra plus être ajoutée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/planification-familiale/close', {
        method: 'POST',
        body: { month },
      });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  const methodeCounts = new Map<string, number>();
  for (const p of items) {
    methodeCounts.set(p.methodeChoisie, (methodeCounts.get(p.methodeChoisie) ?? 0) + 1);
  }
  const nouvellesAcceptantes = items.filter((p) => p.typeVisite === 'Nouvelle acceptante').length;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">
              Registre de planification familiale
            </h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href="/registres/rma/csref"
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

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Total visites
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
            <p className="mt-1 text-xs text-[#898781]">
              {nouvellesAcceptantes} nouvelle{nouvellesAcceptantes > 1 ? 's' : ''} acceptante
              {nouvellesAcceptantes > 1 ? 's' : ''}
            </p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Répartition par méthode
            </p>
            {methodeCounts.size === 0 ? (
              <p className="mt-1 text-sm text-[#52514e]">Aucune visite ce mois-ci.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {[...methodeCounts.entries()].map(([methode, count]) => (
                  <li
                    key={methode}
                    className="rounded-full bg-[#2a78d6]/10 px-3 py-1 text-xs font-medium text-[#2a78d6]"
                  >
                    {methode} × {count}
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
                <th className="px-3 py-2 font-medium">Type de visite</th>
                <th className="px-3 py-2 font-medium">Méthode</th>
                <th className="px-3 py-2 font-medium">Quantité remise</th>
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
              {items.map((p, i) => (
                <tr
                  key={p.id}
                  className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-3 py-2 text-[#898781]">{i + 1}</td>
                  <td className="px-3 py-2 text-[#52514e]">{formatDate(p.date)}</td>
                  <td className="px-3 py-2 text-[#898781]">
                    <Link href={`/patients/${p.patient.id}`} className="hover:underline">
                      {p.patient.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                    {p.patient.nom}, {p.patient.prenom}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {computeAge(p.patient.dateNaissance)}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{p.typeVisite}</td>
                  <td className="px-3 py-2 text-[#52514e]">{p.methodeChoisie}</td>
                  <td className="px-3 py-2 text-[#52514e]">{p.quantiteRemise ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{p.providerName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucune visite ce mois-ci.
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
