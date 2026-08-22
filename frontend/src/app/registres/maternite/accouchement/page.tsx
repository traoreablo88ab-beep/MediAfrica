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

const REGISTER_COLUMN_COUNT = 20;

interface MaterniteRow {
  id: string;
  date: string;
  type: string;
  statutMatrimonial: string | null;
  dateHeureEntree: string | null;
  enfantPrecedent: string | null;
  intervalleGrossessesMois: number | null;
  lieuAccouchement: string | null;
  natureAccouchement: string | null;
  presentation: string | null;
  modeAccouchement: string | null;
  gatpa: boolean | null;
  avortementType: string | null;
  methodeEvacuationAvortement: string | null;
  albendazoleMebendazole: boolean | null;
  dureeTravailHeures: number | null;
  assistePar: string | null;
  praticienQualification: string | null;
  vitamineA: boolean | null;
  issueGrossesse: string | null;
  sexeNouveauNe: string | null;
  misAuSein: boolean | null;
  smk: boolean | null;
  tetracyclinePommade: boolean | null;
  chlorhexidineDigluconate: boolean | null;
  poidsNaissanceG: number | null;
  tailleNaissanceCm: number | null;
  apgar1min: number | null;
  apgar5min: number | null;
  reanimationNouveauNe: boolean | null;
  decesNouveauNeDelai: string | null;
  causesDeces: string | null;
  decesMaternelMoment: string | null;
  causesDecesMaternel: string | null;
  episiotomie: boolean | null;
  placentaComplet: boolean | null;
  complicationsAccouchement: string | null;
  complicationsNouveauNe: string | null;
  indigent: boolean | null;
  telephoneContact: string | null;
  localisationPrecise: string | null;
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

function buildRegisterRows(rows: MaterniteRow[]): { headers: string[]; lines: string[][] } {
  const headers = [
    'N°',
    'Date et heure d’entrée',
    'N° dossier',
    'Nom et prénom',
    'Statut matrimonial',
    'Enfant précédent',
    'Intervalle grossesses (mois)',
    'Lieu',
    'Nature',
    'Présentation',
    'Mode',
    'GATPA',
    'Type avortement',
    'Méthode évacuation avortement',
    'Albendazole/Mébendazole',
    'Durée travail (h)',
    'Assisté par',
    'Praticien — qualification',
    'Vitamine A',
    'Issue',
    'Sexe NN',
    'Mis au sein',
    'SMK',
    'Tétracycline',
    'Chlorhexidine',
    'Poids NN (g)',
    'Taille NN (cm)',
    'Apgar 1min',
    'Apgar 5min',
    'Réanimation',
    'Décès NN',
    'Causes décès NN',
    'Décès maternel — moment',
    'Causes décès maternel',
    'Épisiotomie',
    'Placenta complet',
    'Complications (mère)',
    'Complications (nouveau-né)',
    'Soignant',
  ];
  const lines = rows.map((m, i) => [
    String(i + 1),
    m.dateHeureEntree ? formatDateTime(m.dateHeureEntree) : formatDate(m.date),
    m.patient.dossierNumber,
    `${m.patient.nom}, ${m.patient.prenom}`,
    m.statutMatrimonial ?? '',
    m.enfantPrecedent ?? '',
    m.intervalleGrossessesMois != null ? String(m.intervalleGrossessesMois) : '',
    m.lieuAccouchement ?? '',
    m.natureAccouchement ?? '',
    m.presentation ?? '',
    m.modeAccouchement ?? '',
    m.gatpa ? 'Oui' : '',
    m.avortementType ?? '',
    m.methodeEvacuationAvortement ?? '',
    m.albendazoleMebendazole ? 'Oui' : '',
    m.dureeTravailHeures != null ? String(m.dureeTravailHeures) : '',
    m.assistePar ?? '',
    m.praticienQualification ?? '',
    m.vitamineA ? 'Oui' : '',
    m.issueGrossesse ?? '',
    m.sexeNouveauNe ?? '',
    m.misAuSein ? 'Oui' : '',
    m.smk ? 'Oui' : '',
    m.tetracyclinePommade ? 'Oui' : '',
    m.chlorhexidineDigluconate ? 'Oui' : '',
    m.poidsNaissanceG != null ? String(m.poidsNaissanceG) : '',
    m.tailleNaissanceCm != null ? String(m.tailleNaissanceCm) : '',
    m.apgar1min != null ? String(m.apgar1min) : '',
    m.apgar5min != null ? String(m.apgar5min) : '',
    m.reanimationNouveauNe ? 'Oui' : '',
    m.decesNouveauNeDelai ?? '',
    m.causesDeces ?? '',
    m.decesMaternelMoment ?? '',
    m.causesDecesMaternel ?? '',
    m.episiotomie ? 'Oui' : '',
    m.placentaComplet ? 'Oui' : '',
    m.complicationsAccouchement ?? '',
    m.complicationsNouveauNe ?? '',
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
  a.download = `registre-maternite-accouchement-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(clinicName: string, month: string, rows: MaterniteRow[]): void {
  const { headers, lines } = buildRegisterRows(rows);
  downloadRegisterPdf({
    title: "Registre d'accouchement",
    clinicName,
    month,
    headers,
    rows: lines,
    fileName: `registre-maternite-accouchement-${month}.pdf`,
  });
}

export default function RegistreMaterniteAccouchementPage() {
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
        `/api/registres/maternite/accouchement/closure?month=${selectedMonth}`,
      );
      setClosure(closureRes);

      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const all: MaterniteRow[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          type: 'ACCOUCHEMENT',
          dateFrom,
          dateTo,
          limit: '50',
        });
        if (cursor) params.set('cursor', cursor);
        const page: MaternitePage = await api<MaternitePage>(`/api/maternite?${params.toString()}`);
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      all.sort((a, b) => a.date.localeCompare(b.date));
      setItems(all);
    } catch (err) {
      setError(friendlyError(err, 'Erreur inconnue.'));
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
        `Clôturer le registre d'accouchement de ${month} ? Aucune fiche ne pourra plus être ajoutée pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/maternite/accouchement/close', {
        method: 'POST',
        body: { month },
      });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Erreur inconnue.'));
    } finally {
      setClosing(false);
    }
  }

  const vivants = items.filter((m) => m.issueGrossesse === 'Vivant').length;
  const indigentCount = items.filter((m) => m.indigent).length;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre d&rsquo;accouchement</h1>
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
              Total accouchements
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{items.length}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Naissances vivantes
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#0b0b0b]">{vivants}</p>
          </div>
          <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[#898781]">
              Patientes indigentes
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#d03b3b]">{indigentCount}</p>
          </div>
        </div>

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Date/heure d’entrée</th>
                <th className="px-3 py-2 font-medium">N° dossier</th>
                <th className="px-3 py-2 font-medium">Nom et prénom</th>
                <th className="px-3 py-2 font-medium">Statut matrimonial</th>
                <th className="px-3 py-2 font-medium">Lieu</th>
                <th className="px-3 py-2 font-medium">Nature</th>
                <th className="px-3 py-2 font-medium">Présentation</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">GATPA</th>
                <th className="px-3 py-2 font-medium">Type avort.</th>
                <th className="px-3 py-2 font-medium">Assisté par</th>
                <th className="px-3 py-2 font-medium">Issue</th>
                <th className="px-3 py-2 font-medium">Sexe NN</th>
                <th className="px-3 py-2 font-medium">Poids NN</th>
                <th className="px-3 py-2 font-medium">Taille NN</th>
                <th className="px-3 py-2 font-medium">Apgar</th>
                <th className="px-3 py-2 font-medium">Décès NN</th>
                <th className="px-3 py-2 font-medium">Décès maternel</th>
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
                  <td className="px-3 py-2 text-[#52514e]">
                    {m.dateHeureEntree ? formatDateTime(m.dateHeureEntree) : formatDate(m.date)}
                  </td>
                  <td className="px-3 py-2 text-[#898781]">
                    <Link href={`/patients/${m.patient.id}`} className="hover:underline">
                      {m.patient.dossierNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-[#0b0b0b]">
                    {m.patient.nom}, {m.patient.prenom}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{m.statutMatrimonial ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.lieuAccouchement ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.natureAccouchement ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.presentation ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.modeAccouchement ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.gatpa ? 'Oui' : '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.avortementType ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.assistePar ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.issueGrossesse ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {m.sexeNouveauNe === 'F' ? 'F' : m.sexeNouveauNe === 'M' ? 'M' : '—'}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{m.poidsNaissanceG ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.tailleNaissanceCm ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">
                    {m.apgar1min ?? '—'}/{m.apgar5min ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-[#52514e]">{m.decesNouveauNeDelai ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.decesMaternelMoment ?? '—'}</td>
                  <td className="px-3 py-2 text-[#52514e]">{m.providerName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={REGISTER_COLUMN_COUNT}
                    className="px-3 py-8 text-center text-[#898781]"
                  >
                    Aucun accouchement ce mois-ci.
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
