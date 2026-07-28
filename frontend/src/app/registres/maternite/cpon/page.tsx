'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AppHeader } from '@/components/AppHeader';
import { Skeleton } from '@/components/Skeleton';
import { useClinicName } from '@/lib/useClinicName';
import { MonthPicker } from '@/components/MonthPicker';
import { downloadRegisterPdf } from '@/lib/exportPdf';

const REGISTER_COLUMN_COUNT = 27;

interface MaterniteRow {
  id: string;
  date: string;
  type: string;
  gestite: number | null;
  parite: number | null;
  statutMatrimonial: string | null;
  profession: string | null;
  observations: string | null;
  cponNumeroVisite: number | null;
  cponTypeCas: string | null;
  dateAccouchementCpon: string | null;
  joursPostPartum: number | null;
  poidsKg: number | null;
  tensionArterielle: string | null;
  temperatureC: number | null;
  etatSeins: string | null;
  etatConjonctives: string | null;
  involutionUterine: string | null;
  etatLochies: string | null;
  etatPerinee: string | null;
  etatCol: string | null;
  albendazoleMebendazole: boolean | null;
  maladieDetectee: string | null;
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

function buildRegisterRows(rows: MaterniteRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'Date',
    'N° dossier',
    'Nom et prénom',
    'Âge',
    'Lieu de résidence',
    'Profession',
    'NC',
    'AC',
    'Gestité',
    'Parité',
    'Statut matrimonial',
    "Date d'accouchement",
    'Poids (kg)',
    'TA',
    'Température',
    'État des seins',
    'État des conjonctives',
    'Inv. utérine',
    'État des lochies',
    'État du périnée',
    'État du col',
    'Albendazole/Mébendazole',
    'Maladie détectée',
    "État de l'enfant",
    'Observations',
    'Soignant',
  ];
  const lines = rows.map((m, i) => [
    String(i + 1),
    formatDate(m.date),
    m.patient.dossierNumber,
    `${m.patient.nom}, ${m.patient.prenom}`,
    String(computeAge(m.patient.dateNaissance)),
    m.patient.communeResidence,
    m.profession ?? '',
    m.cponTypeCas === 'NC' ? 'X' : '',
    m.cponTypeCas === 'AC' ? 'X' : '',
    m.gestite != null ? String(m.gestite) : '',
    m.parite != null ? String(m.parite) : '',
    m.statutMatrimonial ?? '',
    m.dateAccouchementCpon ? formatDate(m.dateAccouchementCpon) : '',
    m.poidsKg != null ? String(m.poidsKg) : '',
    m.tensionArterielle ?? '',
    m.temperatureC != null ? String(m.temperatureC) : '',
    m.etatSeins ?? '',
    m.etatConjonctives ?? '',
    m.involutionUterine ?? '',
    m.etatLochies ?? '',
    m.etatPerinee ?? '',
    m.etatCol ?? '',
    m.albendazoleMebendazole ? 'Oui' : '',
    m.maladieDetectee ?? '',
    m.etatNouveauNeCpon ?? '',
    m.observations ?? '',
    m.providerName ?? '',
  ]);
  return { headers, lines };
}

function downloadCsv(month: string, rows: MaterniteRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
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

function downloadPdf(clinicName: string, month: string, rows: MaterniteRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: 'Registre de consultation post-natale (CPoN)',
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-maternite-cpon-${month}.pdf`,
  });
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
                <th className="px-3 py-2 font-medium">Âge</th>
                <th className="px-3 py-2 font-medium">Lieu de résidence</th>
                <th className="px-3 py-2 font-medium">Profession</th>
                <th className="px-3 py-2 font-medium">NC</th>
                <th className="px-3 py-2 font-medium">AC</th>
                <th className="px-3 py-2 font-medium">Gestité</th>
                <th className="px-3 py-2 font-medium">Parité</th>
                <th className="px-3 py-2 font-medium">Statut matrimonial</th>
                <th className="px-3 py-2 font-medium">Date d&rsquo;accouchement</th>
                <th className="px-3 py-2 font-medium">Poids</th>
                <th className="px-3 py-2 font-medium">TA</th>
                <th className="px-3 py-2 font-medium">Température</th>
                <th className="px-3 py-2 font-medium">État des seins</th>
                <th className="px-3 py-2 font-medium">État des conjonctives</th>
                <th className="px-3 py-2 font-medium">Inv. utérine</th>
                <th className="px-3 py-2 font-medium">État des lochies</th>
                <th className="px-3 py-2 font-medium">État du périnée</th>
                <th className="px-3 py-2 font-medium">État du col</th>
                <th className="px-3 py-2 font-medium">Albendazole/Mébendazole</th>
                <th className="px-3 py-2 font-medium">Maladie détectée</th>
                <th className="px-3 py-2 font-medium">État de l&rsquo;enfant</th>
                <th className="px-3 py-2 font-medium">Observations</th>
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
                  <td className="px-3 py-2 text-[#52514e]">
                    {computeAge(m.patient.dateNaissance)}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{m.patient.communeResidence}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.profession ?? '—'}</td>
                  <td className="px-3 py-2 text-center">{m.cponTypeCas === 'NC' ? '✓' : ''}</td>
                  <td className="px-3 py-2 text-center">{m.cponTypeCas === 'AC' ? '✓' : ''}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.gestite ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.parite ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.statutMatrimonial ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {m.dateAccouchementCpon ? formatDate(m.dateAccouchementCpon) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{m.poidsKg ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.tensionArterielle ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.temperatureC ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatSeins ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatConjonctives ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.involutionUterine ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatLochies ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatPerinee ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatCol ?? '—'}</td>
                  <td className="px-3 py-2 text-center">{m.albendazoleMebendazole ? '✓' : ''}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.maladieDetectee ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.etatNouveauNeCpon ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.observations ?? '—'}</td>
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
