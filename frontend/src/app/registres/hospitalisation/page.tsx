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

const REGISTER_LABEL = 'Registre d’hospitalisation';
const REGISTER_COLUMN_COUNT = 14;

interface HospitalisationRow {
  id: string;
  dateHeureEntree: string;
  motifAdmission: string;
  service: string | null;
  numeroHospitalisation: string | null;
  referenceOrigine: string | null;
  profession: string | null;
  indigent: boolean | null;
  diagnosticPrincipal: string | null;
  traitementRecu: string | null;
  dateHeureSortie: string | null;
  issue: string | null;
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

interface HospitalisationPage {
  items: HospitalisationRow[];
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

function computeDureeSejour(entreeIso: string, sortieIso: string | null): string {
  if (!sortieIso) return 'En cours';
  const entree = new Date(entreeIso);
  const sortie = new Date(sortieIso);
  const days = Math.max(0, Math.round((sortie.getTime() - entree.getTime()) / 86_400_000));
  return `${days} j`;
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

function buildRegisterRows(rows: HospitalisationRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'N° Hosp',
    'Date entrée',
    'Nom et prénom',
    'Âge',
    'Sexe',
    'Service',
    'Référence',
    'Profession',
    'Résidence habituelle',
    'Date sortie',
    'Durée de séjour',
    'Diagnostic',
    'Issue',
  ];
  const lines = rows.map((h, i) => [
    String(i + 1),
    h.numeroHospitalisation ?? '',
    formatDate(h.dateHeureEntree),
    `${h.patient.nom}, ${h.patient.prenom}`,
    String(computeAge(h.patient.dateNaissance)),
    h.patient.sexe,
    h.service ?? '',
    h.referenceOrigine ?? '',
    h.profession ?? '',
    h.patient.communeResidence,
    h.dateHeureSortie ? formatDate(h.dateHeureSortie) : 'En cours',
    computeDureeSejour(h.dateHeureEntree, h.dateHeureSortie),
    h.diagnosticPrincipal ?? '',
    h.issue ?? '',
  ]);
  return { headers, lines };
}

// Semicolon delimiter + UTF-8 BOM — the format Excel with a French locale
// expects (comma is the decimal separator there, so it can't be the
// column separator; the BOM keeps accented names/text readable).
function downloadCsv(month: string, rows: HospitalisationRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre-hospitalisation-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(clinicName: string, month: string, rows: HospitalisationRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: REGISTER_LABEL,
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-hospitalisation-${month}.pdf`,
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

export default function RegistreHospitalisationPage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<HospitalisationRow[]>([]);
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const closureRes = await api<ClosureStatus>(
        `/api/registres/hospitalisation/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: HospitalisationRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ dateFrom, dateTo, limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const page: HospitalisationPage = await api<HospitalisationPage>(
          `/api/hospitalisation?${params.toString()}`,
        );
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      all.sort((a, b) => a.dateHeureEntree.localeCompare(b.dateHeureEntree));
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
        `Clôturer le registre de ${month} ? Aucune admission ne pourra plus être ajoutée ou modifiée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/hospitalisation/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  const enCoursCount = items.filter((h) => !h.dateHeureSortie).length;
  const indigentCount = items.filter((h) => h.indigent).length;

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
              Total admissions
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Toujours hospitalisés
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#d08a1c]">{enCoursCount}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Patients indigents
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#d03b3b]">{indigentCount}</p>
          </div>
        </div>

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">N° Hosp</th>
                <th className="px-3 py-2 font-medium">Entrée</th>
                <th className="px-3 py-2 font-medium">Nom et prénom</th>
                <th className="px-3 py-2 font-medium">Âge</th>
                <th className="px-3 py-2 font-medium">Sexe</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Référence</th>
                <th className="px-3 py-2 font-medium">Profession</th>
                <th className="px-3 py-2 font-medium">Résidence</th>
                <th className="px-3 py-2 font-medium">Sortie</th>
                <th className="px-3 py-2 font-medium">Durée</th>
                <th className="px-3 py-2 font-medium">Diagnostic</th>
                <th className="px-3 py-2 font-medium">Issue</th>
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
              {items.map((h, i) => (
                <tr
                  key={h.id}
                  className="border-b border-[#e1e0d9] transition-colors last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-3 py-2 text-[#898781]">{i + 1}</td>
                  <td className="px-3 py-2 text-[#898781]">{h.numeroHospitalisation ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{formatDate(h.dateHeureEntree)}</td>
                  <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                    <Link href={`/patients/${h.patient.id}`} className="hover:underline">
                      {h.patient.nom}, {h.patient.prenom}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {computeAge(h.patient.dateNaissance)}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{h.patient.sexe === 'F' ? 'F' : 'M'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{h.service ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{h.referenceOrigine ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{h.profession ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{h.patient.communeResidence}</td>
                  <td className="px-3 py-2">
                    {h.dateHeureSortie ? (
                      <span className="text-[#52514e]">{formatDate(h.dateHeureSortie)}</span>
                    ) : (
                      <span className="rounded-full bg-[#d08a1c]/10 px-2 py-0.5 text-xs font-medium text-[#d08a1c]">
                        En cours
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {computeDureeSejour(h.dateHeureEntree, h.dateHeureSortie)}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{h.diagnosticPrincipal ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{h.issue ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucune admission ce mois-ci.
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
