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
import {
  STOCK_CATEGORY_LABELS,
  stockItemsByCategory,
  type StockCategory,
} from '@/lib/server/registers/stock-items';

// RMA section 6 — "Gestion des stocks des médicaments du panier/PF/
// Paludisme/SMI", intrants de nutrition et vaccins/consommables. Contrairement
// à Lèpre/Hygiène/Laboratoire (un enregistrement plat par mois), ce registre
// est une grille — une ligne par article (~111 articles, voir STOCK_ITEMS),
// chaque colonne étant le grand livre complet du RMA officiel. Les vaccins
// ont un jeu de colonnes différent (perte détaillée + numéro de lot) — voir
// VACCIN_COLUMNS ci-dessous.
type ColumnType = 'number' | 'text';
interface StockColumn {
  key: string;
  label: string;
  type: ColumnType;
}

const COMMON_COLUMNS: StockColumn[] = [
  { key: 'quantiteDebut', label: 'Début de période', type: 'number' },
  { key: 'quantiteRecue', label: 'Reçue', type: 'number' },
  { key: 'consommation', label: 'Consommation', type: 'number' },
  { key: 'quantiteAjustee', label: 'Ajustée', type: 'number' },
  { key: 'raisonsAjustement', label: 'Raisons ajustement', type: 'text' },
  { key: 'joursRuptureStock', label: 'Jours de rupture', type: 'number' },
  { key: 'raisonsRupture', label: 'Raisons rupture', type: 'text' },
  { key: 'quantiteFin', label: 'Fin de période', type: 'number' },
  { key: 'quantiteCommandee', label: 'Quantité commandée', type: 'number' },
  { key: 'raisonsMiseAJour', label: 'Raisons MàJ commande', type: 'text' },
];

const VACCIN_COLUMNS: StockColumn[] = [
  { key: 'quantiteDebut', label: 'Stock début mois', type: 'number' },
  { key: 'quantiteRecue', label: 'Quantité reçue', type: 'number' },
  { key: 'consommation', label: 'Quantité utilisée', type: 'number' },
  { key: 'quantiteAjustee', label: 'Quantité ajustée', type: 'number' },
  { key: 'perduPcvViree', label: 'Perdue — PCV virée', type: 'number' },
  { key: 'perduCongele', label: 'Perdue — Congelé', type: 'number' },
  { key: 'perduPerime', label: 'Perdue — Périmé', type: 'number' },
  { key: 'perduCasse', label: 'Perdue — Cassé', type: 'number' },
  { key: 'perduAutresAvaries', label: 'Perdue — Autres avariés', type: 'number' },
  { key: 'datePeremption', label: 'Dates péremption', type: 'text' },
  { key: 'joursRuptureStock', label: 'Jours rupture stock', type: 'number' },
  { key: 'quantiteFin', label: 'Stock fin de mois', type: 'number' },
  { key: 'numeroLot', label: 'Numéro de lot', type: 'text' },
];

const CATEGORY_ORDER: StockCategory[] = [
  'panier',
  'pf',
  'paludisme',
  'smi',
  'nutrition',
  'vaccins',
];

function columnsFor(category: StockCategory): StockColumn[] {
  return category === 'vaccins' ? VACCIN_COLUMNS : COMMON_COLUMNS;
}

interface ClosureStatus {
  month: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
}

interface StockLineApi {
  itemKey: string;
  category: StockCategory;
  [column: string]: string | number | null;
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

export default function RegistreStockPage() {
  const clinicName = useClinicName();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  // itemKey -> columnKey -> valeur saisie (chaîne, comme les autres registres)
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const [closureRes, stockRes] = await Promise.all([
        api<ClosureStatus>(`/api/registres/stock/closure?month=${selectedMonth}`),
        api<{ month: string; lines: StockLineApi[] }>(
          `/api/registres/stock?month=${selectedMonth}`,
        ),
      ]);
      setClosure(closureRes);
      const next: Record<string, Record<string, string>> = {};
      for (const line of stockRes.lines) {
        const cols = columnsFor(line.category);
        const row: Record<string, string> = {};
        for (const col of cols) {
          const v = line[col.key];
          row[col.key] = v === null || v === undefined ? '' : String(v);
        }
        next[line.itemKey] = row;
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

  function setCell(itemKey: string, columnKey: string, raw: string) {
    setValues((prev) => ({ ...prev, [itemKey]: { ...prev[itemKey], [columnKey]: raw } }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const lines: Record<string, string | number>[] = [];
      for (const item of CATEGORY_ORDER.flatMap((c) => stockItemsByCategory(c))) {
        const row = values[item.key];
        if (!row) continue;
        const line: Record<string, string | number> = { itemKey: item.key };
        let hasValue = false;
        for (const col of columnsFor(item.category)) {
          const raw = row[col.key];
          if (raw === undefined || raw === '') continue;
          line[col.key] = col.type === 'number' ? Number(raw) : raw;
          hasValue = true;
        }
        if (hasValue) lines.push(line);
      }
      await api('/api/registres/stock', { method: 'PUT', body: { month, lines } });
      toast('Stock enregistré.');
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setSaving(false);
    }
  }

  async function onClose() {
    if (
      !window.confirm(
        `Clôturer le registre Stock de ${month} ? Les quantités ne pourront plus être modifiées pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/stock/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  function downloadPdf() {
    for (const category of CATEGORY_ORDER) {
      const items = stockItemsByCategory(category);
      const cols = columnsFor(category);
      const headers = ['Article', ...cols.map((c) => c.label)];
      const rows = items.map((item) => [
        item.label,
        ...cols.map((c) => values[item.key]?.[c.key] || '—'),
      ]);
      downloadRegisterPdf({
        title: `Registre Stock — ${STOCK_CATEGORY_LABELS[category]}`,
        clinicName,
        month,
        headers,
        rows,
        fileName: `registre-stock-${category}-${month}.pdf`,
      });
    }
  }

  const disabled = loading || saving || closure?.closed === true;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre Stock</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href="/registres/rma/csref"
              className="mt-1 inline-block text-xs text-[#2a78d6] hover:underline"
            >
              Aide à la saisie RMA →
            </Link>
            <p className="mt-1 text-xs text-[#898781]">
              Section 6 du RMA (Gestion des stocks) — grand livre complet des médicaments du
              panier/PF/Paludisme/SMI, des intrants de nutrition et des vaccins/consommables, saisie
              manuelle mensuelle.
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
              Télécharger PDF (6 fichiers)
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

        <div className="flex flex-col gap-6">
          {CATEGORY_ORDER.map((category) => {
            const items = stockItemsByCategory(category);
            const cols = columnsFor(category);
            return (
              <div
                key={category}
                className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
              >
                <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
                  {STOCK_CATEGORY_LABELS[category]}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                        <th className="sticky left-0 bg-white px-3 py-2 font-medium">Article</th>
                        {cols.map((c) => (
                          <th
                            key={c.key}
                            className="px-2 py-2 text-right font-medium whitespace-nowrap"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr
                          key={item.key}
                          className={i !== items.length - 1 ? 'border-b border-[#e1e0d9]' : ''}
                        >
                          <td className="sticky left-0 bg-white px-3 py-2 font-medium whitespace-nowrap text-[#0b0b0b]">
                            {item.label}
                          </td>
                          {cols.map((c) => (
                            <td key={c.key} className="px-1 py-1">
                              <input
                                type={c.type === 'number' ? 'number' : 'text'}
                                min={c.type === 'number' ? 0 : undefined}
                                step={c.type === 'number' ? 1 : undefined}
                                disabled={disabled}
                                value={values[item.key]?.[c.key] ?? ''}
                                onChange={(e) => setCell(item.key, c.key, e.target.value)}
                                className="w-24 rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
