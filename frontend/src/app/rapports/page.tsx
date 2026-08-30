'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useClinicName } from '@/lib/useClinicName';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';

const CHART_COLOR_CURRENT_YEAR = '#2a78d6';
const CHART_COLOR_PREVIOUS_YEAR = '#eb6834';

const MONTH_LABELS = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
];

interface ActiviteCategory {
  key: string;
  label: string;
  monthly: number[];
}

interface ActiviteResponse {
  year: number;
  categories: ActiviteCategory[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

// 4 trimestres (3 mois chacun) + 2 semestres (6 mois chacun) + 1 moyenne
// annuelle (12 mois) — calculés côté client à partir des 12 valeurs
// mensuelles renvoyées par l'API, pour ne pas multiplier les requêtes
// serveur par période.
function periodAverages(monthly: number[]): {
  quarters: number[];
  semesters: number[];
  annual: number;
} {
  const quarters = [0, 1, 2, 3].map((q) => average(monthly.slice(q * 3, q * 3 + 3)));
  const semesters = [0, 1].map((s) => average(monthly.slice(s * 6, s * 6 + 6)));
  const annual = average(monthly);
  return { quarters, semesters, annual };
}

export default function RapportsPage() {
  const clinicName = useClinicName();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<ActiviteResponse | null>(null);
  const [prevYearData, setPrevYearData] = useState<ActiviteResponse | null>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState('consultations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const [res, prevRes] = await Promise.all([
        api<ActiviteResponse>(`/api/rapports/activite?year=${selectedYear}`),
        api<ActiviteResponse>(`/api/rapports/activite?year=${selectedYear - 1}`),
      ]);
      setData(res);
      setPrevYearData(prevRes);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year);
  }, [year, load]);

  const selectedCategory = data?.categories.find((c) => c.key === selectedCategoryKey) ?? null;
  const selectedCategoryPrevYear =
    prevYearData?.categories.find((c) => c.key === selectedCategoryKey) ?? null;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="rapports" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Rapports d&apos;activité</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <p className="mt-1 text-xs text-[#898781]">
              Volumes mensuels par registre, avec moyenne par trimestre, semestre et année.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Année précédente"
                onClick={() => setYear((y) => y - 1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ‹
              </button>
              <span className="min-w-[4rem] px-2 text-center text-sm font-semibold text-[#0b0b0b]">
                {year}
              </span>
              <button
                type="button"
                aria-label="Année suivante"
                onClick={() => setYear((y) => y + 1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ›
              </button>
            </div>
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
            className="mb-4 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b]"
          >
            {error}
          </p>
        )}

        {loading && (
          <p className="mb-4 text-sm text-[#898781]" aria-live="polite">
            Calcul en cours…
          </p>
        )}

        {data && (
          <div className="mb-6 flex flex-col gap-4 print:hidden">
            <div className="flex flex-wrap gap-2">
              {data.categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategoryKey(cat.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    cat.key === selectedCategoryKey
                      ? 'border-[#2a78d6] bg-[#2a78d6]/10 text-[#2a78d6]'
                      : 'border-[#e1e0d9] bg-white text-[#52514e] hover:bg-[#f9f9f7]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
                <h2 className="mb-3 text-sm font-semibold text-[#0b0b0b]">
                  {selectedCategory?.label} — volumes mensuels {year}
                </h2>
                {selectedCategory && (
                  <BarChart
                    data={selectedCategory.monthly.map((v, i) => ({
                      label: MONTH_LABELS[i]!,
                      value: v,
                    }))}
                    color={CHART_COLOR_CURRENT_YEAR}
                  />
                )}
              </div>

              <div className="rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
                <h2 className="mb-3 text-sm font-semibold text-[#0b0b0b]">
                  {selectedCategory?.label} — évolution {year} vs {year - 1}
                </h2>
                {selectedCategory && selectedCategoryPrevYear && (
                  <LineChart
                    series={[
                      {
                        key: 'current',
                        label: String(year),
                        color: CHART_COLOR_CURRENT_YEAR,
                        data: selectedCategory.monthly.map((v, i) => ({
                          label: MONTH_LABELS[i]!,
                          value: v,
                        })),
                      },
                      {
                        key: 'previous',
                        label: String(year - 1),
                        color: CHART_COLOR_PREVIOUS_YEAR,
                        data: selectedCategoryPrevYear.monthly.map((v, i) => ({
                          label: MONTH_LABELS[i]!,
                          value: v,
                        })),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {data && (
          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                    <th className="sticky left-0 bg-white px-3 py-2 font-medium">Registre</th>
                    {MONTH_LABELS.map((label) => (
                      <th
                        key={label}
                        className="px-2 py-2 text-right font-medium whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                    <th className="border-l border-[#e1e0d9] px-2 py-2 text-right font-medium whitespace-nowrap">
                      T1
                    </th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">T2</th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">T3</th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">T4</th>
                    <th className="border-l border-[#e1e0d9] px-2 py-2 text-right font-medium whitespace-nowrap">
                      S1
                    </th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">S2</th>
                    <th className="border-l border-[#e1e0d9] px-3 py-2 text-right font-medium whitespace-nowrap">
                      Année (moy.)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((cat, i) => {
                    const { quarters, semesters, annual } = periodAverages(cat.monthly);
                    return (
                      <tr
                        key={cat.key}
                        className={
                          i !== data.categories.length - 1 ? 'border-b border-[#e1e0d9]' : ''
                        }
                      >
                        <td className="sticky left-0 bg-white px-3 py-2 font-medium whitespace-nowrap text-[#0b0b0b]">
                          {cat.label}
                        </td>
                        {cat.monthly.map((v, m) => (
                          <td key={m} className="px-2 py-2 text-right text-[#52514e]">
                            {v}
                          </td>
                        ))}
                        {quarters.map((v, q) => (
                          <td
                            key={q}
                            className={`px-2 py-2 text-right font-semibold text-[#0b0b0b] ${
                              q === 0 ? 'border-l border-[#e1e0d9]' : ''
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                        {semesters.map((v, s) => (
                          <td
                            key={s}
                            className={`px-2 py-2 text-right font-semibold text-[#0b0b0b] ${
                              s === 0 ? 'border-l border-[#e1e0d9]' : ''
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                        <td className="border-l border-[#e1e0d9] px-3 py-2 text-right font-semibold text-[#0b0b0b]">
                          {annual}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[#e1e0d9] px-4 py-3 text-xs leading-relaxed text-[#898781]">
              Chaque colonne mensuelle compte les évènements créés ce mois-là (date de consultation,
              d&apos;admission ou d&apos;entrée en hospitalisation). T1-T4 et S1-S2 sont la moyenne
              mensuelle sur le trimestre/semestre correspondant, « Année » la moyenne mensuelle sur
              les 12 mois — pas un total.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
