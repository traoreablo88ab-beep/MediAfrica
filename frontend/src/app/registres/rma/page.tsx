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
  codeAffection: string | null;
  deces: boolean | null;
  patient: { dateNaissance: string; sexe: string };
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

interface NutritionSummaryRow {
  date: string;
  dateSortie: string | null;
  ageMois: number | null;
  typeCas: string | null;
  modeAdmission: string | null;
  typeSortie: string | null;
  sourceAdmission: string | null;
  provenanceProgramme: string | null;
  destinationProgramme: string | null;
  patient: { sexe: string };
}

interface PfSummaryRow {
  date: string;
  typeVisite: string;
  methodeChoisie: string;
  typeUtilisateur: string | null;
  counselingDonne: boolean | null;
  serviceProvenance: string | null;
  patient: { sexe: string; dateNaissance: string };
}

interface VaccinationSummaryRow {
  date: string;
  antigene: string;
  effetsSecondaires: string | null;
  patient: { sexe: string; dateNaissance: string };
}

interface ApiPage<T> {
  items: T[];
  nextCursor: string | null;
}

// PEC malnutrition (URENAM/URENAS/URENI) n'a pas d'historique antérieur à
// l'existence du registre PCIMA dans MediAfrica — un seul fetch large depuis
// cette date suffit à calculer début/fin de mois pour n'importe quel mois
// choisi, sans jamais rater une admission antérieure encore active.
const NUTRITION_EPOCH = '2020-01-01';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [yearStr, monthStr] = month.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Bornes exactes du mois choisi, en Date locales (pas des chaînes) — utilisées
// pour classifier chaque enregistrement PCIMA en admission/sortie/actif du
// mois. nextMonthStart est une borne EXCLUSIVE : évite l'ambiguïté d'une
// admission et une sortie le même jour calendaire.
function monthStartAndNext(month: string): { monthStart: Date; nextMonthStart: Date } {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  return {
    monthStart: new Date(year, monthNum - 1, 1),
    nextMonthStart: new Date(year, monthNum, 1),
  };
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

// Correspond au bloc "2. PRISE EN CHARGE DE LA MALNUTRITION (TRAITEMENT)" du
// RMA (page 16) : URENAM = MAM, URENAS = MAS sans complications, URENI = MAS
// avec complications. Chaque table repose sur UN SEUL fetch large par type
// (voir NUTRITION_EPOCH) classifié en 4 natures de ligne :
//  - admissionMonth : admis(e) pendant le mois choisi
//  - sortieMonth    : sorti(e) (dateSortie renseignée) pendant le mois choisi
//  - snapshotDebut  : déjà admis(e) avant le mois et encore actif au 1er jour
//  - snapshotFin    : admis(e) avant/pendant le mois et encore actif au dernier jour
// Les sorties URENAM enregistrées avant l'ajout de dateSortie (typeSortie
// renseigné, dateSortie vide) sont exclues des 2 natures "snapshot" — ni
// comptées actives, ni comptées sorties — plutôt que de fausser silencieusement
// le calcul (voir note affichée sous le tableau URENAM).
function isLegacyUrenamSortieSansDate(n: NutritionSummaryRow): boolean {
  return n.typeSortie != null && n.dateSortie == null;
}

type NutritionRowNature = 'admissionMonth' | 'sortieMonth' | 'snapshotDebut' | 'snapshotFin';

function nutritionNatureMatches(
  n: NutritionSummaryRow,
  nature: NutritionRowNature,
  monthStart: Date,
  nextMonthStart: Date,
): boolean {
  switch (nature) {
    case 'admissionMonth': {
      const d = new Date(n.date);
      return d >= monthStart && d < nextMonthStart;
    }
    case 'sortieMonth': {
      if (!n.dateSortie) return false;
      const d = new Date(n.dateSortie);
      return d >= monthStart && d < nextMonthStart;
    }
    case 'snapshotDebut': {
      if (isLegacyUrenamSortieSansDate(n)) return false;
      const d = new Date(n.date);
      if (d >= monthStart) return false;
      return n.dateSortie == null || new Date(n.dateSortie) >= monthStart;
    }
    case 'snapshotFin': {
      if (isLegacyUrenamSortieSansDate(n)) return false;
      const d = new Date(n.date);
      if (d >= nextMonthStart) return false;
      return n.dateSortie == null || new Date(n.dateSortie) >= nextMonthStart;
    }
  }
}

type NutritionTableRowDef = {
  label: string;
  nature: NutritionRowNature;
  filter?: (n: NutritionSummaryRow) => boolean;
};

const URENAM_ROWS: NutritionTableRowDef[] = [
  { label: 'Anciens malades début de mois', nature: 'snapshotDebut' },
  { label: 'Malades admis', nature: 'admissionMonth' },
  { label: 'Réadmis', nature: 'admissionMonth', filter: (n) => n.typeCas === 'Réadmission' },
  {
    label: 'Admis sur référencement communautaire',
    nature: 'admissionMonth',
    filter: (n) => n.sourceAdmission === 'Dépistage actif',
  },
  { label: 'Guéris', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Guéri' },
  { label: 'Abandon', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Abandon' },
  { label: 'Décès', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Décès' },
  {
    label: 'Non répondant',
    nature: 'sortieMonth',
    filter: (n) => n.typeSortie === 'Non répondant',
  },
  {
    label: "Référés à l'URENAS",
    nature: 'sortieMonth',
    filter: (n) => n.typeSortie === 'Transféré/référé' && n.destinationProgramme === 'URENAS',
  },
  { label: 'Total fin de mois', nature: 'snapshotFin' },
];

const URENAS_ROWS: NutritionTableRowDef[] = [
  { label: 'Anciens malades début de mois', nature: 'snapshotDebut' },
  { label: 'Malades admis', nature: 'admissionMonth' },
  {
    label: 'Réadmis',
    nature: 'admissionMonth',
    filter: (n) => n.modeAdmission === 'Réadmission',
  },
  {
    label: 'Admis sur référencement communautaire',
    nature: 'admissionMonth',
    filter: (n) => n.sourceAdmission === 'Dépistage actif',
  },
  { label: 'Guéris', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Guéri' },
  { label: 'Abandon', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Abandon' },
  { label: 'Décès', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Décès' },
  {
    label: 'Non répondant',
    nature: 'sortieMonth',
    filter: (n) => n.typeSortie === 'Non répondant',
  },
  {
    label: "Référés à l'URENI",
    nature: 'sortieMonth',
    filter: (n) => n.destinationProgramme === 'URENI',
  },
  {
    label: "Transférés de l'URENI",
    nature: 'admissionMonth',
    filter: (n) => n.provenanceProgramme === 'URENI',
  },
  {
    label: "Référés de l'URENAM",
    nature: 'admissionMonth',
    filter: (n) => n.provenanceProgramme === 'URENAM',
  },
  { label: 'Total fin de mois', nature: 'snapshotFin' },
];

const URENI_ROWS: NutritionTableRowDef[] = [
  { label: 'Anciens malades début de mois', nature: 'snapshotDebut' },
  { label: 'Malades admis', nature: 'admissionMonth' },
  {
    label: 'Réadmis',
    nature: 'admissionMonth',
    filter: (n) => n.modeAdmission === 'Réadmission',
  },
  {
    label: 'Admis sur référencement communautaire',
    nature: 'admissionMonth',
    filter: (n) => n.sourceAdmission === 'Dépistage actif',
  },
  { label: 'Traités avec succès', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Guéri' },
  { label: 'Abandon', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Abandon' },
  { label: 'Décès', nature: 'sortieMonth', filter: (n) => n.typeSortie === 'Décès' },
  {
    label: 'Non répondant',
    nature: 'sortieMonth',
    filter: (n) => n.typeSortie === 'Non répondant',
  },
  {
    label: 'En provenance des URENAS/URENAM',
    nature: 'admissionMonth',
    filter: (n) => n.provenanceProgramme === 'URENAS' || n.provenanceProgramme === 'URENAM',
  },
  {
    label: "En provenance d'une autre URENI",
    nature: 'admissionMonth',
    filter: (n) => n.provenanceProgramme === 'URENI',
  },
  { label: 'Total fin de mois', nature: 'snapshotFin' },
];

// Tranches d'âge propres à chaque tableau PCIMA (distinctes des tranches
// "ACTIVITES CURATIVES" ci-dessus) — reprennent le découpage des critères
// d'admission PCIMA maliens. Calculées sur ageMois enregistré à l'admission,
// pas recalculées à la date du mois affiché.
const URENAM_AGE_BRACKETS = ['6-23 mois', '24-59 mois', '60 mois et plus'] as const;
const URENAS_AGE_BRACKETS = ['6-59 mois', '60 mois et plus'] as const;
const URENI_AGE_BRACKETS = ['< 6 mois', '6-59 mois', '60 mois et plus'] as const;

function bracketUrenam(ageMois: number | null): (typeof URENAM_AGE_BRACKETS)[number] | null {
  if (ageMois == null) return null;
  if (ageMois < 24) return '6-23 mois';
  if (ageMois < 60) return '24-59 mois';
  return '60 mois et plus';
}

function bracketUrenas(ageMois: number | null): (typeof URENAS_AGE_BRACKETS)[number] | null {
  if (ageMois == null) return null;
  if (ageMois < 60) return '6-59 mois';
  return '60 mois et plus';
}

function bracketUreni(ageMois: number | null): (typeof URENI_AGE_BRACKETS)[number] | null {
  if (ageMois == null) return null;
  if (ageMois < 6) return '< 6 mois';
  if (ageMois < 60) return '6-59 mois';
  return '60 mois et plus';
}

// Correspond au bloc "PLANIFICATION FAMILIALE" du RMA (pages 7-9) : sections
// "1. NOUVEAUX UTILISATEURS" / "2. ANCIENS UTILISATEURS" (tableau méthode ×
// tranche d'âge × sexe) et "3. COUNSELING...". Contrairement à la nutrition,
// une visite PF est un événement ponctuel (pas d'admission/sortie) : le
// classement se fait simplement sur `date` dans le mois choisi, comme les
// consultations curatives.
const PF_AGE_BRACKETS = ['10-14 ans', '15-19 ans', '20-24 ans', '25 ans et plus'] as const;

function pfAgeBracket(
  dateNaissanceIso: string,
  atIso: string,
): (typeof PF_AGE_BRACKETS)[number] | null {
  const dob = new Date(dateNaissanceIso);
  const at = new Date(atIso);
  let years = at.getFullYear() - dob.getFullYear();
  if (
    at.getMonth() < dob.getMonth() ||
    (at.getMonth() === dob.getMonth() && at.getDate() < dob.getDate())
  ) {
    years -= 1;
  }
  if (years < 10) return null;
  if (years <= 14) return '10-14 ans';
  if (years <= 19) return '15-19 ans';
  if (years <= 24) return '20-24 ans';
  return '25 ans et plus';
}

// Reprend les méthodes suivies par MediAfrica (PlanificationFamiliale.
// methodeChoisie dans schema.prisma) avec le libellé du RMA officiel. Le RMA
// distingue en plus DIUPP / Spermicide / Auto-injection DMPA-S/C comme
// lignes séparées — MediAfrica ne les suit pas séparément (pas de champ
// dédié), elles resteraient sous DIU/Autre/DMPA-SC.
const PF_METHODE_ROWS: { label: string; methode: string }[] = [
  { label: 'Pilule COC', methode: 'Pilule COC' },
  { label: 'Pilule COP', methode: 'Pilule COP' },
  { label: 'Injectable DMPA-IM', methode: 'DMPA-IM' },
  { label: 'Injectable DMPA-S/C', methode: 'DMPA-SC' },
  { label: 'Condoms masculins', methode: 'Condom masculin' },
  { label: 'Condoms féminins', methode: 'Condom féminin' },
  { label: 'Implants (Jadelle)', methode: 'Jadelle' },
  { label: 'Implanon', methode: 'Implanon' },
  { label: 'Collier du cycle', methode: 'Collier' },
  { label: 'DIU', methode: 'DIU' },
  { label: 'MAMA', methode: 'MAMA' },
  { label: 'Contraception chirurgicale volontaire (CCV)', methode: 'CCV' },
  { label: 'Autre', methode: 'Autre' },
];

function buildPfMethodeCounts(
  rows: PfSummaryRow[],
  typeUtilisateur: 'Nouveau' | 'Ancien',
  monthStart: Date,
  nextMonthStart: Date,
): AgeSexCountRow[] {
  const inMonth = rows.filter((r) => {
    const d = new Date(r.date);
    return d >= monthStart && d < nextMonthStart && r.typeUtilisateur === typeUtilisateur;
  });
  return PF_METHODE_ROWS.map(({ label, methode }) => {
    const byBracket = new Map<string, { M: number; F: number }>(
      PF_AGE_BRACKETS.map((b) => [b, { M: 0, F: 0 }]),
    );
    let total = 0;
    for (const r of inMonth) {
      if (r.methodeChoisie !== methode) continue;
      total += 1;
      const bracket = pfAgeBracket(r.patient.dateNaissance, r.date);
      if (!bracket) continue;
      const cell = byBracket.get(bracket);
      if (!cell) continue;
      if (r.patient.sexe === 'M') cell.M += 1;
      else if (r.patient.sexe === 'F') cell.F += 1;
    }
    return { label, byBracket, total };
  });
}

function buildPfCounselingCounts(
  rows: PfSummaryRow[],
  monthStart: Date,
  nextMonthStart: Date,
): AgeSexCountRow[] {
  const byBracket = new Map<string, { M: number; F: number }>(
    PF_AGE_BRACKETS.map((b) => [b, { M: 0, F: 0 }]),
  );
  let total = 0;
  for (const r of rows) {
    const d = new Date(r.date);
    if (d < monthStart || d >= nextMonthStart) continue;
    if (r.counselingDonne !== true) continue;
    total += 1;
    const bracket = pfAgeBracket(r.patient.dateNaissance, r.date);
    if (!bracket) continue;
    const cell = byBracket.get(bracket);
    if (!cell) continue;
    if (r.patient.sexe === 'M') cell.M += 1;
    else if (r.patient.sexe === 'F') cell.F += 1;
  }
  return [{ label: 'Utilisateurs ayant bénéficié du counseling PF', byBracket, total }];
}

// Correspond au bloc "VACCINATION" du RMA — mais ce tableau détaillé
// antigène × tranche d'âge × sexe n'existe QUE dans le RMA 1er échelon
// (CSCom, pages 14-16), pas dans le 2ème échelon (CSRéf) suivi par le reste
// de cette page — le 2ème échelon n'a qu'un tableau de stock de vaccins
// (pharmacie, hors périmètre). La liste d'antigènes ci-dessous reprend
// exactement `ANTIGENES` de patients/[id]/vaccination/new/page.tsx, qui a
// elle-même été construite à partir des colonnes 8-45 du registre PEV
// officiel. Comme pour la PF, MediAfrica ne suit pas la stratégie (Centre
// fixe / Avancée / Mobile / Hors aire) : les tableaux ci-dessous donnent un
// total toutes stratégies confondues.
function ageInMonthsAt(dateNaissanceIso: string, atIso: string): number {
  const dob = new Date(dateNaissanceIso);
  const at = new Date(atIso);
  let months = (at.getFullYear() - dob.getFullYear()) * 12 + (at.getMonth() - dob.getMonth());
  if (at.getDate() < dob.getDate()) months -= 1;
  return Math.max(months, 0);
}

const PEV_AGE_BRACKETS = ['0-11 mois', '12-23 mois', '24 mois et plus'] as const;

function pevAgeBracket(dateNaissanceIso: string, atIso: string): (typeof PEV_AGE_BRACKETS)[number] {
  const m = ageInMonthsAt(dateNaissanceIso, atIso);
  if (m < 12) return '0-11 mois';
  if (m < 24) return '12-23 mois';
  return '24 mois et plus';
}

// Tranches propres au tableau "Vaccination contre le Paludisme chez les
// enfants de 5 à 36 mois" (RMA 1er échelon, page 14) — distinctes des
// tranches PEV ci-dessus.
const R21_AGE_BRACKETS = ['5-11 mois', '12-23 mois', '24-36 mois'] as const;

function r21AgeBracket(
  dateNaissanceIso: string,
  atIso: string,
): (typeof R21_AGE_BRACKETS)[number] | null {
  const m = ageInMonthsAt(dateNaissanceIso, atIso);
  if (m < 5) return null;
  if (m <= 11) return '5-11 mois';
  if (m <= 23) return '12-23 mois';
  if (m <= 36) return '24-36 mois';
  return null;
}

const PEV_ANTIGENE_ROWS: { label: string; antigene: string }[] = [
  { label: 'BCG', antigene: 'BCG' },
  { label: 'Hépatite B', antigene: 'Hépatite B' },
  { label: 'VPO-0', antigene: 'VPO0' },
  { label: 'VPO-1', antigene: 'VPO1' },
  { label: 'VPO-2', antigene: 'VPO2' },
  { label: 'VPO-3', antigene: 'VPO3' },
  { label: 'VPI-1', antigene: 'VPI1' },
  { label: 'VPI-2', antigene: 'VPI2' },
  { label: 'Penta-1', antigene: 'Penta1' },
  { label: 'Penta-2', antigene: 'Penta2' },
  { label: 'Penta-3', antigene: 'Penta3' },
  { label: 'PCV13-1', antigene: 'PCV13-1' },
  { label: 'PCV13-2', antigene: 'PCV13-2' },
  { label: 'PCV13-3', antigene: 'PCV13-3' },
  { label: 'Rota-1', antigene: 'Rota1' },
  { label: 'Rota-2', antigene: 'Rota2' },
  { label: 'Rota-3', antigene: 'Rota3' },
  { label: 'VAR-1 (VRR-1)', antigene: 'VAR1' },
  { label: 'VAR-2 (VRR-2)', antigene: 'VAR2' },
  { label: 'VAA', antigene: 'VAA' },
  { label: 'MenSCV', antigene: 'MenSCV' },
  { label: 'MenAfriVac', antigene: 'MenAfriVac' },
];

const R21_ANTIGENE_ROWS: { label: string; antigene: string }[] = [
  { label: 'Vaccin anti-palu R21-1', antigene: 'Vaccin anti-palu R21-1' },
  { label: 'Vaccin anti-palu R21-2', antigene: 'Vaccin anti-palu R21-2' },
  { label: 'Vaccin anti-palu R21-3', antigene: 'Vaccin anti-palu R21-3' },
];

function buildAntigeneCounts(
  rows: VaccinationSummaryRow[],
  rowDefs: { label: string; antigene: string }[],
  ageBrackets: readonly string[],
  bracketOf: (dateNaissanceIso: string, atIso: string) => string | null,
  monthStart: Date,
  nextMonthStart: Date,
): AgeSexCountRow[] {
  const inMonth = rows.filter((r) => {
    const d = new Date(r.date);
    return d >= monthStart && d < nextMonthStart;
  });
  return rowDefs.map(({ label, antigene }) => {
    const byBracket = new Map<string, { M: number; F: number }>(
      ageBrackets.map((b) => [b, { M: 0, F: 0 }]),
    );
    let total = 0;
    for (const r of inMonth) {
      if (r.antigene !== antigene) continue;
      total += 1;
      const bracket = bracketOf(r.patient.dateNaissance, r.date);
      if (!bracket) continue;
      const cell = byBracket.get(bracket);
      if (!cell) continue;
      if (r.patient.sexe === 'M') cell.M += 1;
      else if (r.patient.sexe === 'F') cell.F += 1;
    }
    return { label, byBracket, total };
  });
}

interface AgeSexCountRow {
  label: string;
  byBracket: Map<string, { M: number; F: number }>;
  total: number;
}

// Additionne une liste de AgeSexCountRow en une seule ligne de total (ex.
// "Total Utilisateurs par méthode" du tableau PF) — chaque bracket est
// sommé indépendamment, plus le total global.
function withTotalRow(rows: AgeSexCountRow[], label: string): AgeSexCountRow[] {
  const byBracket = new Map<string, { M: number; F: number }>();
  let total = 0;
  for (const r of rows) {
    total += r.total;
    for (const [bracket, cell] of r.byBracket) {
      const acc = byBracket.get(bracket) ?? { M: 0, F: 0 };
      acc.M += cell.M;
      acc.F += cell.F;
      byBracket.set(bracket, acc);
    }
  }
  return [...rows, { label, byBracket, total }];
}

function buildNutritionCounts(
  rows: NutritionSummaryRow[],
  rowDefs: NutritionTableRowDef[],
  ageBrackets: readonly string[],
  bracketOf: (ageMois: number | null) => string | null,
  monthStart: Date,
  nextMonthStart: Date,
): AgeSexCountRow[] {
  return rowDefs.map((def) => {
    const byBracket = new Map<string, { M: number; F: number }>(
      ageBrackets.map((b) => [b, { M: 0, F: 0 }]),
    );
    let total = 0;
    for (const n of rows) {
      if (!nutritionNatureMatches(n, def.nature, monthStart, nextMonthStart)) continue;
      if (def.filter && !def.filter(n)) continue;
      total += 1;
      const bracket = bracketOf(n.ageMois);
      if (!bracket) continue;
      const cell = byBracket.get(bracket);
      if (!cell) continue;
      if (n.patient.sexe === 'M') cell.M += 1;
      else if (n.patient.sexe === 'F') cell.F += 1;
    }
    return { label: def.label, byBracket, total };
  });
}

// Liste officielle du "Rapport de morbidité et de mortalité" (RMA, section 7).
// Même liste que MORBIDITE_AFFECTIONS sur le formulaire de nouvelle
// consultation (dupliquée localement par page, même précédent que
// PEV_ANTIGENE_ROWS vs ANTIGENES) — `label` doit rester identique entre les
// deux pour que `codeAffection` (stocké tel quel) matche ici. `hasDeces`
// détermine si une ligne "— Décès" est ajoutée sous la ligne "— Cas".
const MORBIDITE_ROWS: { label: string; hasDeces: boolean }[] = [
  { label: 'Choléra', hasDeces: true },
  { label: 'Diarrhée présumée infectieuse (hors choléra)', hasDeces: true },
  { label: 'Rougeole', hasDeces: true },
  { label: 'Tétanos', hasDeces: true },
  { label: 'Tétanos néo-natal', hasDeces: true },
  { label: 'Fistule obstétricale', hasDeces: true },
  { label: "Cancer du col de l'utérus", hasDeces: true },
  { label: 'Cancer du sein', hasDeces: true },
  { label: 'Paralysie Flasque Aiguë', hasDeces: false },
  { label: 'Méningite cérébrospinale', hasDeces: true },
  { label: 'Toux<15j, IRA basses (pneumonie, bronchopneumonie)', hasDeces: true },
  { label: 'IRA hautes (rhinopharyngite, rhinite, trachéite)', hasDeces: false },
  { label: 'Toux > 15 jours', hasDeces: true },
  { label: 'Tuberculose suspecte', hasDeces: true },
  { label: 'Tuberculose confirmée', hasDeces: true },
  { label: 'Paludisme suspect', hasDeces: false },
  { label: 'Cas présumés de paludisme simple (diagnostic clinique)', hasDeces: false },
  { label: 'Cas présumés de paludisme grave (diagnostic clinique)', hasDeces: true },
  { label: 'Paludisme simple confirmé', hasDeces: false },
  { label: 'Paludisme grave confirmé', hasDeces: true },
  { label: 'Fièvre typhoïde', hasDeces: true },
  { label: 'Conjonctivites', hasDeces: false },
  { label: 'Trachome', hasDeces: false },
  { label: 'Trichiasis', hasDeces: false },
  { label: 'Cataracte', hasDeces: false },
  { label: 'Glaucome', hasDeces: false },
  { label: 'Vices de réfraction et basses de vision', hasDeces: false },
  { label: "Baisse d'Acuité visuelle (BAV)", hasDeces: false },
  { label: 'Traumatismes oculaires (coup, accident domestique/travail)', hasDeces: false },
  { label: 'Rétinopathie diabétique', hasDeces: false },
  { label: 'Bilharziose urinaire', hasDeces: false },
  { label: 'Vers intestinaux', hasDeces: false },
  { label: 'Écoulement urétral et/ou dysurie', hasDeces: false },
  { label: 'Ulcération génitale', hasDeces: false },
  { label: 'Syphilis endémique', hasDeces: false },
  { label: 'Écoulement vaginal', hasDeces: false },
  { label: 'Douleurs abdominales basses', hasDeces: false },
  { label: 'Conjonctivite du nouveau-né', hasDeces: false },
  { label: 'Insuffisance pondérale', hasDeces: false },
  { label: 'Malnutrition Aiguë Sévère', hasDeces: true },
  { label: 'Retard de croissance', hasDeces: false },
  { label: "Intoxication alimentaire d'origine chimique", hasDeces: true },
  { label: "Intoxication alimentaire d'origine microbienne", hasDeces: true },
  { label: 'Troubles liés à la grossesse', hasDeces: true },
  { label: "Troubles liés à l'accouchement et au post-partum", hasDeces: true },
  { label: 'Traumatisme lié aux accidents de la voie publique', hasDeces: true },
  { label: 'Traumatisme non lié aux accidents de la voie publique', hasDeces: true },
  { label: 'Traumatismes : coups et blessures volontaires', hasDeces: true },
  { label: 'Traumatismes : accidents domestiques', hasDeces: true },
  { label: 'Carie dentaire', hasDeces: false },
  { label: 'Gingivite simple', hasDeces: false },
  { label: 'Gingivite ulcéro-nécrotique aiguë', hasDeces: false },
  { label: 'Noma', hasDeces: true },
  { label: 'Autres affections de la bouche et des dents', hasDeces: true },
  { label: 'HTA', hasDeces: true },
  { label: 'Otite aiguë', hasDeces: false },
  { label: 'Otite purulente', hasDeces: false },
  { label: 'Sinusite', hasDeces: false },
  { label: 'Angine', hasDeces: false },
  { label: 'Drépanocytose', hasDeces: true },
  { label: 'Anémie', hasDeces: true },
  { label: 'Diabète', hasDeces: true },
  { label: 'Dracunculose', hasDeces: false },
  { label: 'SIDA', hasDeces: true },
  { label: 'Troubles mentaux', hasDeces: true },
  { label: 'Eczéma', hasDeces: false },
  { label: 'Intertrigo (mycose des plis)', hasDeces: false },
  { label: 'Teigne', hasDeces: false },
  { label: 'Gale', hasDeces: false },
  { label: 'Pyodermite', hasDeces: false },
  { label: 'Onchocercose', hasDeces: false },
  { label: 'Trypanosomiase humaine africaine', hasDeces: true },
  { label: 'Autres', hasDeces: true },
];

// Toute consultation du mois doit apparaître dans ce tableau, pas seulement
// celles codées avec une des 72 affections nommées : une consultation dont
// codeAffection est vide ou ne correspond à aucune d'elles tombe dans
// "Autres" (dernière ligne), le fourre-tout officiel du RMA — jamais
// silencieusement exclue du rapport.
const NAMED_MORBIDITE_LABELS = new Set(
  MORBIDITE_ROWS.filter((r) => r.label !== 'Autres').map((r) => r.label),
);

// `consultations` est déjà fetché pour le mois exact choisi (voir load()) —
// pas de filtrage par date ici, contrairement à buildNutritionCounts qui
// travaille sur un fetch large multi-mois.
function buildMorbiditeCounts(rows: ConsultationRow[]): AgeSexCountRow[] {
  function countRow(label: string, matches: (c: ConsultationRow) => boolean): AgeSexCountRow {
    const byBracket = new Map<string, { M: number; F: number }>(
      AGE_BRACKETS.map((b) => [b, { M: 0, F: 0 }]),
    );
    let total = 0;
    for (const c of rows) {
      if (!matches(c)) continue;
      total += 1;
      const bracket = ageBracketAt(c.patient.dateNaissance, c.date);
      const cell = byBracket.get(bracket);
      if (!cell) continue;
      if (c.patient.sexe === 'M') cell.M += 1;
      else if (c.patient.sexe === 'F') cell.F += 1;
    }
    return { label, byBracket, total };
  }

  const out: AgeSexCountRow[] = [];
  for (const def of MORBIDITE_ROWS) {
    const isCatchAll = def.label === 'Autres';
    const matchesDisease = (c: ConsultationRow) =>
      isCatchAll
        ? !NAMED_MORBIDITE_LABELS.has(c.codeAffection ?? '')
        : c.codeAffection === def.label;
    out.push(countRow(`${def.label} — Cas`, matchesDisease));
    if (def.hasDeces) {
      out.push(countRow(`${def.label} — Décès`, (c) => matchesDisease(c) && c.deces === true));
    }
  }
  return out;
}

function AgeSexTable({
  title,
  ageBrackets,
  counts,
  note,
  summaryLines,
}: {
  title: string;
  ageBrackets: readonly string[];
  counts: AgeSexCountRow[];
  note?: string;
  summaryLines?: RmaLine[];
}) {
  const columns = ageBrackets.flatMap((b) => [
    { bracket: b, sex: 'M' as const },
    { bracket: b, sex: 'F' as const },
  ]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
      <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
        {title}
      </h2>
      {note && <p className="border-b border-[#e1e0d9] px-4 py-2 text-xs text-[#898781]">{note}</p>}
      {summaryLines && summaryLines.length > 0 && (
        <dl className="border-b border-[#e1e0d9]">
          {summaryLines.map((line, i) => (
            <div
              key={line.label}
              className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${
                i !== summaryLines.length - 1 ? 'border-b border-[#e1e0d9]' : ''
              }`}
            >
              <dt className="text-[#52514e]">
                {line.label}
                {line.note && <span className="ml-1 text-xs text-[#898781]">({line.note})</span>}
              </dt>
              <dd className="shrink-0 text-base font-semibold text-[#0b0b0b]">
                {line.value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
              <th rowSpan={2} className="px-3 py-2 align-bottom font-medium whitespace-nowrap">
                Indicateur
              </th>
              {ageBrackets.map((b) => (
                <th
                  key={b}
                  colSpan={2}
                  className="border-l border-[#e1e0d9] px-3 py-2 text-center font-medium whitespace-nowrap"
                >
                  {b}
                </th>
              ))}
              <th
                rowSpan={2}
                className="border-l border-[#e1e0d9] px-3 py-2 text-right align-bottom font-medium"
              >
                Total mois
              </th>
            </tr>
            <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
              {columns.map((col) => (
                <th
                  key={`${col.bracket}-${col.sex}`}
                  className={`px-2 py-1 text-right font-medium ${
                    col.sex === 'M' ? 'border-l border-[#e1e0d9]' : ''
                  }`}
                >
                  {col.sex}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {counts.map((row, i) => (
              <tr
                key={row.label}
                className={i !== counts.length - 1 ? 'border-b border-[#e1e0d9]' : ''}
              >
                <td className="px-3 py-2 font-medium text-[#0b0b0b] whitespace-nowrap">
                  {row.label}
                </td>
                {columns.map((col) => {
                  const cell = row.byBracket.get(col.bracket) ?? { M: 0, F: 0 };
                  return (
                    <td
                      key={`${col.bracket}-${col.sex}`}
                      className={`px-2 py-2 text-right text-[#52514e] ${
                        col.sex === 'M' ? 'border-l border-[#e1e0d9]' : ''
                      }`}
                    >
                      {cell[col.sex]}
                    </td>
                  );
                })}
                <td className="border-l border-[#e1e0d9] px-3 py-2 text-right font-semibold text-[#0b0b0b]">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RmaPage() {
  const clinicName = useClinicName();
  const [month, setMonth] = useState(currentMonth());
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [cpn, setCpn] = useState<MaterniteRow[]>([]);
  const [accouchements, setAccouchements] = useState<MaterniteRow[]>([]);
  const [cpon, setCpon] = useState<MaterniteRow[]>([]);
  const [urenam, setUrenam] = useState<NutritionSummaryRow[]>([]);
  const [urenas, setUrenas] = useState<NutritionSummaryRow[]>([]);
  const [ureni, setUreni] = useState<NutritionSummaryRow[]>([]);
  const [pf, setPf] = useState<PfSummaryRow[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const { dateFrom, dateTo } = monthBounds(selectedMonth);
      const [
        consultationRows,
        cpnRows,
        accouchementRows,
        cponRows,
        urenamRows,
        urenasRows,
        ureniRows,
        pfRows,
        vaccinationRows,
      ] = await Promise.all([
        fetchAllPages<ConsultationRow>('/api/consultations', dateFrom, dateTo),
        fetchAllPages<MaterniteRow>('/api/maternite', dateFrom, dateTo, { type: 'CPN' }),
        fetchAllPages<MaterniteRow>('/api/maternite', dateFrom, dateTo, { type: 'ACCOUCHEMENT' }),
        fetchAllPages<MaterniteRow>('/api/maternite', dateFrom, dateTo, { type: 'CPON' }),
        fetchAllPages<NutritionSummaryRow>('/api/nutrition', NUTRITION_EPOCH, dateTo, {
          type: 'URENAM',
          summary: '1',
        }),
        fetchAllPages<NutritionSummaryRow>('/api/nutrition', NUTRITION_EPOCH, dateTo, {
          type: 'URENAS',
          summary: '1',
        }),
        fetchAllPages<NutritionSummaryRow>('/api/nutrition', NUTRITION_EPOCH, dateTo, {
          type: 'URENI',
          summary: '1',
        }),
        fetchAllPages<PfSummaryRow>('/api/planification-familiale', dateFrom, dateTo),
        fetchAllPages<VaccinationSummaryRow>('/api/vaccination', dateFrom, dateTo),
      ]);
      setConsultations(consultationRows);
      setCpn(cpnRows);
      setAccouchements(accouchementRows);
      setCpon(cponRows);
      setUrenam(urenamRows);
      setUrenas(urenasRows);
      setUreni(ureniRows);
      setPf(pfRows);
      setVaccinations(vaccinationRows);
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

  const morbiditeCounts = buildMorbiditeCounts(consultations);

  const { monthStart, nextMonthStart } = monthStartAndNext(month);
  const urenamCounts = buildNutritionCounts(
    urenam,
    URENAM_ROWS,
    URENAM_AGE_BRACKETS,
    bracketUrenam,
    monthStart,
    nextMonthStart,
  );
  const urenasCounts = buildNutritionCounts(
    urenas,
    URENAS_ROWS,
    URENAS_AGE_BRACKETS,
    bracketUrenas,
    monthStart,
    nextMonthStart,
  );
  const ureniCounts = buildNutritionCounts(
    ureni,
    URENI_ROWS,
    URENI_AGE_BRACKETS,
    bracketUreni,
    monthStart,
    nextMonthStart,
  );
  const hasLegacyUrenamSortie = urenam.some(isLegacyUrenamSortieSansDate);

  const pfNouveauxCounts = withTotalRow(
    buildPfMethodeCounts(pf, 'Nouveau', monthStart, nextMonthStart),
    'Total Nouveaux Utilisateurs par méthode',
  );
  const pfAnciensCounts = withTotalRow(
    buildPfMethodeCounts(pf, 'Ancien', monthStart, nextMonthStart),
    'Total Anciens Utilisateurs par méthode',
  );
  const pfCounselingCounts = buildPfCounselingCounts(pf, monthStart, nextMonthStart);

  const pfMonth = pf.filter((r) => {
    const d = new Date(r.date);
    return d >= monthStart && d < nextMonthStart;
  });
  const pfDistinctDays = new Set(pfMonth.map((r) => new Date(r.date).toDateString())).size;
  const isPfPostPartum = (r: PfSummaryRow) =>
    r.serviceProvenance === 'Accouchement' || r.serviceProvenance === 'CPoN';

  // "1. NOUVEAUX UTILISATEURS" (page 7) — la ligne "séances de consultation
  // PF" est un total combiné nouveaux+anciens dans le PDF (placée avant la
  // scission), donc affichée une seule fois, ici. Le PDF sépare aussi les
  // colonnes CENTRE FIXE / STRATEGIE AVANCEE OU MOBILE — MediAfrica ne suit
  // pas le lieu de la visite, ces 2 lignes restent donc "—".
  const pfNouveauxLines: RmaLine[] = [
    {
      label: 'Nombre de séances de consultation PF dans le mois',
      value: pfDistinctDays,
      note: 'jours distincts avec au moins une visite PF, nouveaux + anciens confondus',
    },
    { label: 'Nombre de nouvelles consultations en centre fixe', value: null },
    { label: 'Nombre de nouvelles consultations en Stratégie avancée ou mobile', value: null },
    {
      label: 'Nombre de nouvelles utilisatrices de PF en post-partum',
      value: pfMonth.filter((r) => r.typeUtilisateur === 'Nouveau' && isPfPostPartum(r)).length,
      note: 'approximation : provenance Accouchement ou CPoN',
    },
  ];

  const pfAnciensLines: RmaLine[] = [
    { label: "Nombre d'anciennes consultations en centre fixe", value: null },
    { label: "Nombre d'anciennes consultations en Stratégie avancée ou mobile", value: null },
    {
      label: "Nombre d'anciennes utilisatrices de PF en post partum",
      value: pfMonth.filter((r) => r.typeUtilisateur === 'Ancien' && isPfPostPartum(r)).length,
      note: 'approximation : provenance Accouchement ou CPoN',
    },
  ];

  // "4. SENSIBILISATION SUR LA PF" (page 9) — activités communautaires
  // (plaidoyer, causeries, conférences, projections de films) sans lien à un
  // dossier patient : aucun modèle MediAfrica ne les suit, entièrement "—".
  const pfSensibilisationLines: RmaLine[] = [
    { label: 'Plaidoyer — Hommes', value: null },
    { label: 'Plaidoyer — Femmes', value: null },
    { label: 'Causeries en centre de santé — Hommes', value: null },
    { label: 'Causeries en centre de santé — Femmes', value: null },
    { label: 'Causeries dans la communauté — Hommes', value: null },
    { label: 'Causeries dans la communauté — Femmes', value: null },
    { label: 'Conférence — Hommes', value: null },
    { label: 'Conférence — Femmes', value: null },
    { label: 'Projection de films — Hommes', value: null },
    { label: 'Projection de films — Femmes', value: null },
    { label: "Nombre total de participants aux activités d'IEC", value: null },
  ];

  const pevCounts = withTotalRow(
    buildAntigeneCounts(
      vaccinations,
      PEV_ANTIGENE_ROWS,
      PEV_AGE_BRACKETS,
      pevAgeBracket,
      monthStart,
      nextMonthStart,
    ),
    'Total doses administrées',
  );
  const r21Counts = withTotalRow(
    buildAntigeneCounts(
      vaccinations,
      R21_ANTIGENE_ROWS,
      R21_AGE_BRACKETS,
      r21AgeBracket,
      monthStart,
      nextMonthStart,
    ),
    'Total doses administrées',
  );

  const vaccinationMonth = vaccinations.filter((r) => {
    const d = new Date(r.date);
    return d >= monthStart && d < nextMonthStart;
  });
  const vaccinationDistinctDays = new Set(
    vaccinationMonth.map((r) => new Date(r.date).toDateString()),
  ).size;
  function countAntigenes(...names: string[]): number {
    return vaccinationMonth.filter((r) => names.includes(r.antigene)).length;
  }

  const pevSummaryLines: RmaLine[] = [
    {
      label: 'Nombre de séances de vaccination dans le mois',
      value: vaccinationDistinctDays,
      note: 'jours distincts avec au moins une vaccination, toutes stratégies confondues',
    },
    { label: 'Séances en centre fixe', value: null },
    { label: 'Séances en stratégie avancée', value: null },
    { label: 'Séances en stratégie mobile', value: null },
  ];

  // "VACCINATION HPV CHEZ LES FILLES AGEES DE 10 ANS", "VACCINATIONS DES
  // FEMMES" (Td/TdR) et "ACTIVITES PROMOTIONNELLES DE VACCINATION" (RMA 1er
  // échelon, pages 15-16) — regroupées ici en une seule carte car aucune
  // n'a besoin d'une matrice âge × sexe (cible déjà fixée par le vaccin, ou
  // non calculable du tout).
  const vaccinationAutresLines: RmaLine[] = [
    { label: 'HPV — Filles scolarisées', value: countAntigenes('HPV Cible scolarisée') },
    { label: 'HPV — Filles non scolarisées', value: countAntigenes('HPV Cible non scolarisée') },
    {
      label: 'HPV — 2ème dose (immunodéprimées)',
      value: countAntigenes('HPV 2ème dose (immunodéprimées)'),
    },
    {
      label: 'Td-1 (femmes)',
      value: countAntigenes('Td1'),
      note: 'total, non distingué femmes enceintes / non enceintes comme dans le RMA',
    },
    {
      label: 'Td-2 (femmes)',
      value: countAntigenes('Td2'),
      note: 'total, non distingué femmes enceintes / non enceintes comme dans le RMA',
    },
    {
      label: 'Td-R (femmes)',
      value: countAntigenes('TdR'),
      note: 'total, non distingué femmes enceintes / non enceintes comme dans le RMA',
    },
    {
      label: 'Vitamine A (toutes doses)',
      value: countAntigenes('Vitamine A-1', 'Vitamine A-2', 'Vitamine A-3'),
    },
    { label: 'Albendazole', value: countAntigenes('Albendazole') },
    { label: 'Enfants ayant reçu une MILD au cours du PEV', value: countAntigenes('MILD') },
    { label: 'Rappel 1', value: countAntigenes('Rappel 1') },
    { label: 'Rappel 2', value: countAntigenes('Rappel 2') },
    { label: 'Nombre IEC PEV au cours des séances', value: null },
    { label: 'Nombre de participants aux séances', value: null },
    { label: 'Nombre de VAD/PEV effectuées', value: null },
    { label: 'Nombre émission radio PEV', value: null },
    {
      label: 'Nombre de MAPI/EIM notifiées',
      value: vaccinationMonth.filter(
        (r) => r.effetsSecondaires != null && r.effetsSecondaires.trim() !== '',
      ).length,
      note: 'via le champ « effets secondaires » de la fiche de vaccination',
    },
  ];

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
          Ces tableaux reprennent l'intitulé exact des lignes « ACTIVITES CURATIVES », « GROSSESSE,
          ACCOUCHEMENT ET SUITES DE COUCHE », « PRISE EN CHARGE DE LA MALNUTRITION » et «
          PLANIFICATION FAMILIALE » du RMA 2ème échelon / CSRéf (janvier 2019, pages 5-9 et 16), et
          « VACCINATION » du RMA <strong>1er échelon</strong> / CSCom (même version, pages 14-16) —
          le 2ème échelon n'a qu'un tableau de stock de vaccins (pharmacie), pas le détail des doses
          administrées, d'où l'emprunt au 1er échelon pour cette seule section. Les lignes avec un
          chiffre sont calculées automatiquement à partir des données déjà enregistrées dans
          MediAfrica. Les lignes avec « — » n'ont pas de champ correspondant dans l'application
          aujourd'hui — à compléter à la main. Ça ne soumet rien à DHIS2 : reporte les chiffres dans
          le formulaire papier ou dans DHIS2. Pour les 3 tableaux de malnutrition, l'âge est réparti
          selon la tranche enregistrée à l'admission (pas recalculée pour le mois affiché), la
          colonne « FE/FA » du RMA officiel n'est pas reproduite (MediAfrica ne marque pas femme
          enceinte/allaitante) et la ligne « Admis sur référencement communautaire » est une
          approximation (source d'admission « Dépistage actif »). Pour la planification familiale et
          la vaccination, MediAfrica ne suit pas le lieu de la visite (colonnes « Centre fixe » / «
          Stratégie avancée ou mobile » du RMA officiel toujours « — »), les lignes « post-partum »
          (PF) sont une approximation (provenance Accouchement ou CPoN), les lignes Td/TdR ne
          distinguent pas femmes enceintes/non enceintes, et les sections « Sensibilisation » (PF)
          et « activités promotionnelles » (vaccination) — activités communautaires sans lien à un
          dossier patient — ne sont pas suivies du tout. Le tableau « Morbidité et mortalité »
          couvre toutes les consultations du mois : chacune compte sous sa maladie si un code
          d'affection RMA lui a été assigné, sinon sous « Autres ». Les autres sections du RMA
          (RH/matériel/financier, urgences obstétricales, chirurgie, fistule, laboratoire,
          lèpre/dracunculose/paludisme détaillé, pharmacie) restent hors périmètre de cette page —
          la section Hygiène est disponible séparément sur{' '}
          <Link href="/registres/hygiene" className="text-[#2a78d6] hover:underline">
            /registres/hygiene
          </Link>
          .
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

          <AgeSexTable
            title="Morbidité et mortalité"
            ageBrackets={AGE_BRACKETS}
            counts={morbiditeCounts}
            note="Toute consultation du mois est comptée ici : sous sa maladie si un code d'affection RMA lui a été assigné (depuis le formulaire de consultation ou directement depuis le registre), sinon sous « Autres — Cas »."
          />

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

          <AgeSexTable
            title="PRISE EN CHARGE DE LA MALNUTRITION — URENI (MAS avec complications)"
            ageBrackets={URENI_AGE_BRACKETS}
            counts={ureniCounts}
          />

          <AgeSexTable
            title="PRISE EN CHARGE DE LA MALNUTRITION — URENAS (MAS sans complications)"
            ageBrackets={URENAS_AGE_BRACKETS}
            counts={urenasCounts}
          />

          <AgeSexTable
            title="PRISE EN CHARGE DE LA MALNUTRITION — URENAM (MAM)"
            ageBrackets={URENAM_AGE_BRACKETS}
            counts={urenamCounts}
            {...(hasLegacyUrenamSortie
              ? {
                  note: "Certaines sorties URENAM enregistrées avant l'ajout de la date de sortie n'ont pas de date — elles sont exclues des lignes « début » et « fin de mois » (ni actives, ni sorties) plutôt que de fausser le calcul.",
                }
              : {})}
          />

          <AgeSexTable
            title="PLANIFICATION FAMILIALE — 1. Nouveaux utilisateurs"
            ageBrackets={PF_AGE_BRACKETS}
            counts={pfNouveauxCounts}
            summaryLines={pfNouveauxLines}
          />

          <AgeSexTable
            title="PLANIFICATION FAMILIALE — 2. Anciens utilisateurs"
            ageBrackets={PF_AGE_BRACKETS}
            counts={pfAnciensCounts}
            summaryLines={pfAnciensLines}
          />

          <AgeSexTable
            title="PLANIFICATION FAMILIALE — 3. Counseling"
            ageBrackets={PF_AGE_BRACKETS}
            counts={pfCounselingCounts}
            note="Sources d'information des utilisateurs sur la PF (radio, télévision, causerie, ami/connaissance, ASC/relais, réseaux sociaux, autres) : non suivies dans MediAfrica."
          />

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              PLANIFICATION FAMILIALE — 4. Sensibilisation
            </h2>
            <dl>
              {pfSensibilisationLines.map((line, i) => (
                <div
                  key={line.label}
                  className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
                    i !== pfSensibilisationLines.length - 1 ? 'border-b border-[#e1e0d9]' : ''
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

          <AgeSexTable
            title="VACCINATION — Couverture vaccinale PEV"
            ageBrackets={PEV_AGE_BRACKETS}
            counts={pevCounts}
            summaryLines={pevSummaryLines}
          />

          <AgeSexTable
            title="VACCINATION — Vaccination antipaludique R21 (enfants 5-36 mois)"
            ageBrackets={R21_AGE_BRACKETS}
            counts={r21Counts}
          />

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              VACCINATION — HPV, Td/TdR, suppléments &amp; activités promotionnelles
            </h2>
            <dl>
              {vaccinationAutresLines.map((line, i) => (
                <div
                  key={line.label}
                  className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
                    i !== vaccinationAutresLines.length - 1 ? 'border-b border-[#e1e0d9]' : ''
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
