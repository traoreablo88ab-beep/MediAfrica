'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';
import { MonthPicker } from '@/components/MonthPicker';

const REGISTER_COLUMN_COUNT = 9;

interface MaterniteRow {
  id: string;
  date: string;
  type: string;
  cponNumeroVisite: number | null;
  joursPostPartum: number | null;
  etatPerinee: string | null;
  allaitement: string | null;
  planificationFamiliale: string | null;
  etatNouveauNeCpon: string | null;
  vaccinationBcgFait: boolean | null;
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

interface MaternitePage {
  items: MaterniteRow[];
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

function csvEscape(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(month: string, rows: MaterniteRow[]): void {
  const headers = [
    'N°',
    'Date',
    'N° dossier',
    'Nom et prénom',
    'Visite',
    'Jours post-partum',
    'État périnée',
    'Allaitement',
    'Planification familiale',
    'État nouveau-né',
    'BCG',
    'Soignant',
  ];
  const lines = rows.map((m, i) => [
    String(i + 1),
    formatDate(m.date),
    m.patient.dossierNumber,
    `${m.patient.nom}, ${m.patient.prenom}`,
    m.cponNumeroVisite != null ? String(m.cponNumeroVisite) : '',
    m.joursPostPartum != null ? String(m.joursPostPartum) : '',
    m.etatPerinee ?? '',
    m.allaitement ?? '',
    m.planificationFamiliale ?? '',
    m.etatNouveauNeCpon ?? '',
    m.vaccinationBcgFait ? 'Oui' : '',
    m.providerName ?? '',
  ]);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-maternite-cpon-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RegistreMaterniteCponPage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<MaterniteRow[]>([]);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const closureRes = await api<ClosureStatus>(
        `/api/registres/maternite/cpon/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: MaterniteRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ type: 'CPON', dateFrom, dateTo, limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const page: MaternitePage = await api<MaternitePage>(`/api/maternite?${params.toString()}`);
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      all.sort((a, b) => a.date.localeCompare(b.date));
      setItems(all);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'Vous devez être connecté pour voir cette page.'
            : err.message
          : 'Erreur inconnue',
      );
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
        `Clôturer le registre CPoN de ${month} ? Aucune fiche CPoN ne pourra plus être ajoutée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/maternite/cpon/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue');
    } finally {
      setClosing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre CPoN</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mois précédent"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ‹
              </button>
              <MonthPicker value={month} onChange={setMonth} />
              <button
                type="button"
                aria-label="Mois suivant"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(month, items)}
              disabled={items.length === 0}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50"
            >
              Exporter CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7]"
            >
              Imprimer
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

        <div className="mb-6 rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
            Total consultations CPoN
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
        </div>

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">N° dossier</th>
                <th className="px-3 py-2 font-medium">Nom et prénom</th>
                <th className="px-3 py-2 font-medium">Visite</th>
                <th className="px-3 py-2 font-medium">Jours PP</th>
                <th className="px-3 py-2 font-medium">Périnée</th>
                <th className="px-3 py-2 font-medium">Allaitement</th>
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
              {items.map((m, i) => (
                <tr
                  key={m.id}
                  className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-3 py-2 text-[#898781]">{i + 1}</td>
                  <td className="px-3 py-2 text-[#52514e]">{formatDate(m.date)}</td>
                  <td className="px-3 py-2 text-[#898781]">
                    <Link href={`/patients/${m.patient.id}`} className="hover:underline">
                      {m.patient.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                    {m.patient.nom}, {m.patient.prenom}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{m.cponNumeroVisite ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.joursPostPartum ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatPerinee ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.allaitement ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.providerName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucune fiche CPoN ce mois-ci.
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
