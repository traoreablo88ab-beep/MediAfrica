'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';
import { MonthPicker } from '@/components/MonthPicker';

const REGISTER_COLUMN_COUNT = 19;

interface ConsultationRow {
  id: string;
  date: string;
  motif: string;
  status: string;
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

// Semicolon delimiter + UTF-8 BOM — the format Excel with a French locale
// expects (comma is the decimal separator there, so it can't be the
// column separator; the BOM keeps accented names/text readable).
function downloadCsv(month: string, rows: ConsultationRow[]): void {
  const headers = [
    'N°',
    'Date',
    'N° dossier',
    'Nom et prénom',
    'Âge',
    'Sexe',
    'Provenance',
    'Motif',
    'NC',
    'AC',
    'Diagnostic',
    'TDR',
    'GE',
    'Poids (kg)',
    'Taille (cm)',
    'PB (cm)',
    'P/T',
    'MDO',
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
    c.motif,
    c.typeCas === 'NC' ? 'X' : '',
    c.typeCas === 'AC' ? 'X' : '',
    c.diagnostic ?? '',
    c.tdr ?? '',
    c.ge ?? '',
    c.poidsKg != null ? String(c.poidsKg) : '',
    c.tailleCm != null ? String(c.tailleCm) : '',
    c.perimetreBrachialCm != null ? String(c.perimetreBrachialCm) : '',
    c.statutPT ?? '',
    c.mdo ? (c.mdoMaladie ?? 'Oui') : '',
    c.traitementPrescrit ?? '',
    c.providerName ?? '',
  ]);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-consultation-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

export default function RegistreConsultationPage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<ConsultationRow[]>([]);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
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

  const totalNC = items.filter((c) => c.typeCas === 'NC').length;
  const totalAC = items.filter((c) => c.typeCas === 'AC').length;
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
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre de consultation</h1>
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
              Total consultations
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
            <p className="mt-1 text-xs text-[#898781]">
              {totalNC} nouveau{totalNC > 1 ? 'x' : ''} cas · {totalAC} ancien
              {totalAC > 1 ? 's' : ''} cas
            </p>
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
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">N° dossier</th>
                <th className="px-3 py-2 font-medium">Nom et prénom</th>
                <th className="px-3 py-2 font-medium">Âge</th>
                <th className="px-3 py-2 font-medium">Sexe</th>
                <th className="px-3 py-2 font-medium">Provenance</th>
                <th className="px-3 py-2 font-medium">Motif</th>
                <th className="px-3 py-2 font-medium">NC</th>
                <th className="px-3 py-2 font-medium">AC</th>
                <th className="px-3 py-2 font-medium">Diagnostic</th>
                <th className="px-3 py-2 font-medium">TDR</th>
                <th className="px-3 py-2 font-medium">GE</th>
                <th className="px-3 py-2 font-medium">Poids</th>
                <th className="px-3 py-2 font-medium">Taille</th>
                <th className="px-3 py-2 font-medium">PB</th>
                <th className="px-3 py-2 font-medium">P/T</th>
                <th className="px-3 py-2 font-medium">MDO</th>
                <th className="px-3 py-2 font-medium">Traitement</th>
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
                  <td className="px-3 py-2 text-[#52514e]">{c.motif}</td>
                  <td className="px-3 py-2 text-center">{c.typeCas === 'NC' ? '✓' : ''}</td>
                  <td className="px-3 py-2 text-center">{c.typeCas === 'AC' ? '✓' : ''}</td>
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
                  <td className="px-3 py-2 text-[#52514e]">{c.traitementPrescrit ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{c.providerName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={20} className="px-3 py-8 text-center text-[#898781]">
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
