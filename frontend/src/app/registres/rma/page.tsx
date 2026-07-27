'use client';

// Aide à la saisie du RMA (Rapport Mensuel d'Activités, modèle 2ème échelon
// / CSRéf, version janvier 2019, Ministère de la Santé du Mali) — reproduit
// ligne par ligne les tableaux "ACTIVITES CURATIVES" et "GROSSESSE,
// ACCOUCHEMENT ET SUITES DE COUCHE" du PDF officiel (pages 5-6), remplis
// automatiquement à partir des données déjà enregistrées dans MediAfrica
// quand c'est possible. Ne soumet rien à DHIS2 : l'utilisateur recopie les
// chiffres dans le formulaire papier ou dans DHIS2.
//
// Précision sur la numérotation du PDF : la "Section 3" officielle est en
// réalité "PROVENANCE ET CIRCONSTANCES DE PRISE EN CHARGE" (référé/évacué
// par structure d'origine, page 4) — pas les activités curatives. Le
// tableau "ACTIVITES CURATIVES" et le bloc "GROSSESSE, ACCOUCHEMENT ET
// SUITES DE COUCHE" suivent juste après, sans numéro de section propre
// (le PDF ne les numérote pas). La "Section 5" officielle, elle, couvre
// Lèpre / Dracunculose / Paludisme (page 13), pas la maternité.
//
// Les tranches d'âge (0-11 mois, 1-4, 5-14, 15-44, 45-59, 60 ans et plus)
// reproduisent exactement le découpage du tableau "ACTIVITES CURATIVES" du
// RMA (page 5). L'âge est calculé à la date de la consultation (pas
// "aujourd'hui"), pour rester correct sur les mois passés.
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useClinicName } from '@/lib/useClinicName';
import { MonthPicker } from '@/components/MonthPicker';

const AGE_BRACKETS = [
  '0-11 mois',
  '1-4 ans',
  '5-14 ans',
  '15-44 ans',
  '45-59 ans',
  '60 ans et plus',
] as const;
type AgeBracket = (typeof AGE_BRACKETS)[number];

function ageBracketAt(dateNaissanceIso: string, atIso: string): AgeBracket {
  const dob = new Date(dateNaissanceIso);
  const at = new Date(atIso);
  let months = (at.getFullYear() - dob.getFullYear()) * 12 + (at.getMonth() - dob.getMonth());
  if (at.getDate() < dob.getDate()) months -= 1;
  months = Math.max(months, 0);
  if (months < 12) return '0-11 mois';
  const years = Math.floor(months / 12);
  if (years <= 4) return '1-4 ans';
  if (years <= 14) return '5-14 ans';
  if (years <= 44) return '15-44 ans';
  if (years <= 59) return '45-59 ans';
  return '60 ans et plus';
}

interface ConsultationRow {
  date: string;
  typeCas: string | null;
  mdo: boolean;
  mdoMaladie: string | null;
  tdr: string | null;
  ge: string | null;
  patient: { dateNaissance: string };
}

interface MaterniteRow {
  type: 'CPN' | 'ACCOUCHEMENT' | 'CPON';
  cpnNumeroVisite: number | null;
  cponNumeroVisite: number | null;
  ferAcideFolique: boolean | null;
  issueGrossesse: string | null;
  reanimationNouveauNe: boolean | null;
  assistePar: string | null;
  poidsNaissanceG: number | null;
}

interface ApiPage<T> {
  items: T[];
  nextCursor: string | null;
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

async function fetchAllPages<T>(
  path: string,
  dateFrom: string,
  dateTo: string,
  extraParams?: Record<string, string>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ dateFrom, dateTo, limit: '100', ...extraParams });
    if (cursor) params.set('cursor', cursor);
    const page: ApiPage<T> = await api<ApiPage<T>>(`${path}?${params.toString()}`);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

// value === null -> "—" (pas de champ correspondant dans MediAfrica
// aujourd'hui, à compléter à la main). Reprend l'intitulé exact du PDF.
interface RmaLine {
  label: string;
  value: number | null;
  note?: string;
}

// null = "—" (non calculable), sinon une fonction qui filtre les
// consultations retenues pour cette ligne, comptées ensuite par tranche d'âge.
type CurativeRow = {
  label: string;
  filter: ((c: ConsultationRow) => boolean) | null;
};

const CURATIVE_ROWS: CurativeRow[] = [
  { label: 'Nombre de nouvelles consultations curatives (NC)', filter: (c) => c.typeCas === 'NC' },
  { label: 'Nombre total de consultations curatives (NC+AC)', filter: () => true },
  { label: 'Nombre de consultations curatives référées', filter: null },
  { label: 'Nombre de consultations curatives évacuées', filter: null },
];

export default function RmaPage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [cpn, setCpn] = useState<MaterniteRow[]>([]);
  const [accouchements, setAccouchements] = useState<MaterniteRow[]>([]);
  const [cpon, setCpon] = useState<MaterniteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const [consultationRows, cpnRows, accouchementRows, cponRows] = await Promise.all([
        fetchAllPages<ConsultationRow>('/api/consultations', dateFrom, dateTo),
        fetchAllPages<MaterniteRow>('/api/maternite', dateFrom, dateTo, { type: 'CPN' }),
        fetchAllPages<MaterniteRow>('/api/maternite', dateFrom, dateTo, { type: 'ACCOUCHEMENT' }),
        fetchAllPages<MaterniteRow>('/api/maternite', dateFrom, dateTo, { type: 'CPON' }),
      ]);
      setConsultations(consultationRows);
      setCpn(cpnRows);
      setAccouchements(accouchementRows);
      setCpon(cponRows);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  const mdoCases = consultations.filter((c) => c.mdo);
  const mdoByMaladie = new Map<string, number>();
  for (const c of mdoCases) {
    const key = c.mdoMaladie?.trim() || 'Non précisé';
    mdoByMaladie.set(key, (mdoByMaladie.get(key) ?? 0) + 1);
  }

  // { rowLabel -> { bracket -> count } }, plus un total par ligne.
  const curativeCounts = CURATIVE_ROWS.map((row) => {
    const byBracket = new Map<AgeBracket, number>(AGE_BRACKETS.map((b) => [b, 0]));
    if (row.filter) {
      for (const c of consultations) {
        if (!row.filter(c)) continue;
        const bracket = ageBracketAt(c.patient.dateNaissance, c.date);
        byBracket.set(bracket, (byBracket.get(bracket) ?? 0) + 1);
      }
    }
    const total = row.filter ? [...byBracket.values()].reduce((a, b) => a + b, 0) : null;
    return { ...row, byBracket, total };
  });

  // Reprend l'ordre et l'intitulé exact du bloc "GROSSESSE, ACCOUCHEMENT ET
  // SUITES DE COUCHE" du PDF (pages 5-6). Le PDF détaille CPN et
  // accouchement par tranche d'âge (10-14/15-19/20-24/25+) et par zone
  // aire/hors aire — MediAfrica ne suit pas la zone de résidence, ces
  // lignes sont donc données en total uniquement.
  const grossesseAccouchementLines: RmaLine[] = [
    { label: 'Nombre de séances CPN en centre fixe', value: null },
    { label: 'Nombre de séances CPN en stratégie avancée / mobile', value: null },
    {
      label: 'Nombre nouvelles inscriptions à la CPN = NC',
      value: cpn.filter((m) => m.cpnNumeroVisite === 1).length,
      note: 'total, non détaillé par âge/aire comme dans le RMA',
    },
    { label: 'Nombre total CPN = NC + AC', value: cpn.length },
    {
      label: "Nombre de femme ayant bénéficié d'au moins 4 CPN",
      value: cpn.filter((m) => (m.cpnNumeroVisite ?? 0) >= 4).length,
      note: 'approximation : 4ème visite ou plus ce mois-ci',
    },
    {
      label: "Nombre de femmes enceintes ayant reçu du fer et de l'acide folique",
      value: cpn.filter((m) => m.ferAcideFolique === true).length,
    },
    {
      label: "Nombre de femmes enceintes ayant reçu l'albendazole / Mebendazole",
      value: null,
    },
    { label: 'Nombre de CPN effective*', value: null },
    { label: "Nombre de femmes enceintes ayant un taux d'Hb < 11 g/dl", value: null },
    { label: 'Nombre total accouchements au centre', value: accouchements.length },
    {
      label: 'Par personnel qualifié',
      value: accouchements.filter((m) => ['Sage-femme', 'Médecin'].includes(m.assistePar ?? ''))
        .length,
    },
    {
      label: 'Par matrone/ATRS',
      value: accouchements.filter((m) => ['Matrone', 'Auxiliaire'].includes(m.assistePar ?? ''))
        .length,
    },
    { label: 'Avec application de la GATPA', value: null },
    { label: "Nombre de cas d'hémorragie après GATPA", value: null },
    { label: "Nombre d'accouchement à domicile", value: null },
    {
      label: 'Nombre de nouvelles consultations post-natales',
      value: cpon.filter((m) => m.cponNumeroVisite === 1).length,
    },
    { label: 'Nombre de femmes en PPI ayant reçu le fer + acide folique', value: null },
    { label: "Nombre de femmes en PPI ayant reçu l'albendazole / mebendazole", value: null },
    {
      label: 'Nombre de naissances vivantes',
      value: accouchements.filter((m) => m.issueGrossesse === 'Vivant').length,
    },
    { label: 'Nombre de nouveau-né mis au sein immédiatement', value: null },
    {
      label: 'Nombre de nouveau-nés avec un poids < 2500g',
      value: accouchements.filter((m) => m.poidsNaissanceG != null && m.poidsNaissanceG < 2500)
        .length,
    },
    {
      label: 'Nombre de nouveau-nés réanimés',
      value: accouchements.filter((m) => m.reanimationNouveauNe === true).length,
    },
    { label: 'Nombre de nouveau-né ayant reçu la vitamine K1', value: null },
    { label: 'Nombre de nouveau-né ayant reçu la tétracycline pommade 1%', value: null },
    { label: 'Nombre de nouveau-né ayant reçu la chlorhexidine digluconate 7,1%', value: null },
    { label: "Nombre d'enfant ayant bénéficié de soins mère kangourou (SMK)", value: null },
    { label: 'Nombre de naissance déclarée dans le registre de déclaration', value: null },
    {
      label: 'Nombre de nouveau-né vus en consultation post natale',
      value: cpon.length,
    },
    { label: 'Nombre référé — femmes enceintes', value: null },
    { label: 'Nombre référé — femmes en post-partum', value: null },
    { label: 'Nombre référé — nouveau-nés', value: null },
    { label: 'Nombre évacué — femmes enceintes', value: null },
    { label: 'Nombre évacué — femmes en travail', value: null },
    { label: 'Nombre évacué — femmes en post-partum', value: null },
    { label: 'Nombre évacué — nouveau-nés', value: null },
    { label: 'Nombre décès — maternels', value: null },
    { label: 'Nombre décès — nouveau-nés dans les 24 heures', value: null },
    { label: 'Nombre décès — nouveau-nés avant 7ème jour', value: null },
    { label: 'Nombre décès — nouveau-nés dans les 28 jours', value: null },
    {
      label: 'Nombre de mortsnés — frais',
      value: accouchements.filter((m) => m.issueGrossesse === 'Mort-né frais').length,
    },
    {
      label: 'Nombre de mortsnés — macérés',
      value: accouchements.filter((m) => m.issueGrossesse === 'Mort-né macéré').length,
    },
  ];

  const paludismeLines: RmaLine[] = [
    {
      label: 'Cas suspects testés (TDR ou GE)',
      value: consultations.filter(
        (c) => (c.tdr && c.tdr !== 'Non fait') || (c.ge && c.ge !== 'Non fait'),
      ).length,
    },
    {
      label: 'Cas confirmés (TDR ou GE positif)',
      value: consultations.filter((c) => c.tdr === 'Positif' || c.ge === 'Positif').length,
    },
  ];

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-6xl px-6 py-6">
        <div className="mb-1 print:hidden">
          <Link href="/registres/consultation" className="text-sm text-[#2a78d6] hover:underline">
            ← Retour aux registres
          </Link>
        </div>

        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0b0b0b] sm:text-2xl">Aide à la saisie RMA</h1>
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
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7]"
            >
              Imprimer
            </button>
          </div>
        </div>

        <p className="mb-6 rounded-xl border border-[#e1e0d9] bg-white p-4 text-xs leading-relaxed text-[#52514e] print:hidden">
          Ces tableaux reprennent l'intitulé exact des lignes « ACTIVITES CURATIVES » et «
          GROSSESSE, ACCOUCHEMENT ET SUITES DE COUCHE » du RMA (2ème échelon / CSRéf, janvier 2019,
          pages 5-6). Les lignes avec un chiffre sont calculées automatiquement à partir des données
          déjà enregistrées dans MediAfrica. Les lignes avec « — » n'ont pas de champ correspondant
          dans l'application aujourd'hui — à compléter à la main. Ça ne soumet rien à DHIS2 :
          reporte les chiffres dans le formulaire papier ou dans DHIS2. Les autres sections du RMA
          (RH/matériel/financier, planning familial, urgences obstétricales, chirurgie, fistule,
          laboratoire, lèpre/dracunculose/paludisme détaillé, nutrition, pharmacie, hygiène) restent
          hors périmètre de cette page.
        </p>

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

        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              ACTIVITES CURATIVES
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                    <th className="px-3 py-2 font-medium">Activités</th>
                    {AGE_BRACKETS.map((b) => (
                      <th key={b} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {b}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total mois</th>
                  </tr>
                </thead>
                <tbody>
                  {curativeCounts.map((row, i) => (
                    <tr
                      key={row.label}
                      className={i !== curativeCounts.length - 1 ? 'border-b border-[#e1e0d9]' : ''}
                    >
                      <td className="px-3 py-2 font-medium text-[#0b0b0b] whitespace-nowrap">
                        {row.label}
                      </td>
                      {AGE_BRACKETS.map((b) => (
                        <td key={b} className="px-3 py-2 text-right text-[#52514e]">
                          {row.filter ? (row.byBracket.get(b) ?? 0) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold text-[#0b0b0b]">
                        {row.total ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              GROSSESSE, ACCOUCHEMENT ET SUITES DE COUCHE
            </h2>
            <dl>
              {grossesseAccouchementLines.map((line, i) => (
                <div
                  key={line.label}
                  className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
                    i !== grossesseAccouchementLines.length - 1 ? 'border-b border-[#e1e0d9]' : ''
                  }`}
                >
                  <dt className="text-[#52514e]">
                    {line.label}
                    {line.note && (
                      <span className="ml-1 text-xs text-[#898781]">({line.note})</span>
                    )}
                  </dt>
                  <dd className="shrink-0 text-base font-semibold text-[#0b0b0b]">
                    {line.value ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Paludisme (aperçu)
            </h2>
            <dl>
              {paludismeLines.map((line, i) => (
                <div
                  key={line.label}
                  className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
                    i !== paludismeLines.length - 1 ? 'border-b border-[#e1e0d9]' : ''
                  }`}
                >
                  <dt className="text-[#52514e]">{line.label}</dt>
                  <dd className="shrink-0 text-base font-semibold text-[#0b0b0b]">
                    {line.value ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Maladies à déclaration obligatoire (MDO)
            </h2>
            <div className="p-4">
              {mdoCases.length === 0 ? (
                <p className="text-sm text-[#52514e]">Aucun cas ce mois-ci.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
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
        </div>
      </div>
    </main>
  );
}
