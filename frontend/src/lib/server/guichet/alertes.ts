// Guichet alert rules — .planning/prd-guichet-entree.md § 6 (6 rules, exact
// thresholds below). Two kinds of checks:
//   - SYNCHRONOUS: anything knowable at the moment of the triggering
//     mutation (écart at clôture, horaires at emission, rafale d'annulation
//     at annulation) — called inline from the corresponding route so the
//     alert fires immediately, not a day later.
//   - CRON (runGuichetAlertesCheck, called by
//     app/api/cron/guichet-alertes/route.ts): anything needing a full day's
//     data or a 30-day rolling average (taux d'annulation quotidien, type de
//     recette annulé 3 jours consécutifs, inactivité anormale) plus two
//     tamper-detection sweeps (rupture de séquence, montant hors grille) —
//     both structurally unreachable through this app's own routes (montant
//     is always server-derived, numeroSequence is always max+1 inside a
//     transaction), so they only ever fire on direct DB tampering.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { enqueueOutbox } from '../outbox';

export type GuichetAlerteType =
  | 'ecart_caisse'
  | 'hors_horaires'
  | 'annulations_suspectes'
  | 'inactivite'
  | 'rupture_sequence'
  | 'montant_hors_grille';

export type GuichetAlerteSeverite = 'info' | 'attention' | 'critique';

// Exact thresholds from the PRD. Adjustable-per-center configuration is
// explicitly Phase 5 ("Configuration des seuils par centre") — out of scope
// here; these are the hardcoded defaults the PRD itself specifies.
export const SEUILS = {
  ECART_ATTENTION_PCT: 0.02,
  ECART_CRITIQUE_PCT: 0.08,
  ECART_CRITIQUE_ABS_FCFA: 10_000,
  HORS_HORAIRES_TOLERANCE_MIN: 30,
  ANNULATION_TAUX_ATTENTION_PCT: 0.15,
  ANNULATION_RAFALE_COUNT: 3,
  ANNULATION_RAFALE_WINDOW_MIN: 10,
  ANNULATION_MEME_TYPE_JOURS_CONSECUTIFS: 3,
  INACTIVITE_FACTEUR_ATTENTION: 2,
  ROLLING_WINDOW_DAYS: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES_FR = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const;

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

/**
 * Creates the GuichetAlerte row and — for severite 'attention'/'critique'
 * only, per § 6.7 ('info' stays report/historique-only) — enqueues the
 * `guichet.alerte` outbox event (in-app Notification always; email for
 * 'critique') inside the same transaction so the two are atomic.
 */
export async function fireGuichetAlerte(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    typeAlerte: GuichetAlerteType;
    severite: GuichetAlerteSeverite;
    title: string;
    body: string;
    details?: Record<string, unknown>;
  },
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { owner: { select: { id: true, email: true } } },
  });
  if (!org) throw new Error(`fireGuichetAlerte: organization ${input.organizationId} not found`);

  return prisma.$transaction(async (tx) => {
    const alerte = await tx.guichetAlerte.create({
      data: {
        organizationId: input.organizationId,
        typeAlerte: input.typeAlerte,
        severite: input.severite,
        details: (input.details ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    });

    if (input.severite !== 'info') {
      await enqueueOutbox(tx, {
        kind: 'guichet.alerte',
        payload: {
          alerteId: alerte.id,
          organizationId: input.organizationId,
          typeAlerte: input.typeAlerte,
          severite: input.severite,
          ownerId: org.owner.id,
          ownerEmail: org.owner.email,
          title: input.title,
          body: input.body,
        },
      });
    }

    return alerte.id;
  });
}

/** Average of daily (emise-transaction) revenue sums over the ROLLING_WINDOW_DAYS prior to `before` (excludes `before`'s own day — that day may still be in progress). */
async function computeAvgDailyCA(
  prisma: PrismaClient,
  organizationId: string,
  before: Date,
): Promise<number> {
  const { start: todayStart } = dayBounds(before);
  const windowStart = new Date(todayStart.getTime() - SEUILS.ROLLING_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.guichetTransaction.findMany({
    where: {
      organizationId,
      statut: 'emise',
      createdAt: { gte: windowStart, lt: todayStart },
    },
    select: { montant: true, createdAt: true },
  });
  if (rows.length === 0) return 0;
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + r.montant);
  }
  const total = [...byDay.values()].reduce((s, v) => s + v, 0);
  // Averaged over the number of days actually observed, not the full window
  // — a newly-opened center with < 30 days of history shouldn't have its
  // average diluted by days that don't exist yet.
  return total / byDay.size;
}

// § 6.1 — checked synchronously right after a clôture's écart is known
// (frontend/src/app/api/guichet/cloture/route.ts).
export async function checkEcartCaisse(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    clotureId: string;
    guichetierName: string;
    dateService: string;
    ecart: number;
  },
): Promise<void> {
  const avgDailyCA = await computeAvgDailyCA(prisma, input.organizationId, new Date());
  const ecartAbs = Math.abs(input.ecart);
  const ecartPct = avgDailyCA > 0 ? ecartAbs / avgDailyCA : 0;

  let severite: GuichetAlerteSeverite | null = null;
  // "le plus bas des deux déclenche" — either condition alone is sufficient.
  if (ecartPct > SEUILS.ECART_CRITIQUE_PCT || ecartAbs > SEUILS.ECART_CRITIQUE_ABS_FCFA) {
    severite = 'critique';
  } else if (ecartPct > SEUILS.ECART_ATTENTION_PCT) {
    severite = 'attention';
  }
  if (!severite) return;

  const sign = input.ecart > 0 ? '+' : '';
  await fireGuichetAlerte(prisma, {
    organizationId: input.organizationId,
    typeAlerte: 'ecart_caisse',
    severite,
    title: severite === 'critique' ? 'Écart de caisse critique' : 'Écart de caisse',
    body: `Écart de ${sign}${input.ecart} FCFA constaté à la clôture de ${input.guichetierName} le ${input.dateService}.`,
    details: { clotureId: input.clotureId, ecart: input.ecart, avgDailyCA },
  });
}

function parseHeure(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// § 6.2 — checked synchronously right after a transaction is emitted
// (frontend/src/app/api/guichet/transactions/route.ts). No-op if the org
// hasn't declared horaires (ClinicSettings.heureOuverture/heureFermeture).
export async function checkHorsHoraires(
  prisma: PrismaClient,
  input: { organizationId: string; transactionId: string; createdAt: Date },
): Promise<void> {
  const settings = await prisma.clinicSettings.findUnique({
    where: { organizationId: input.organizationId },
    select: { heureOuverture: true, heureFermeture: true, joursFermeture: true },
  });
  if (!settings?.heureOuverture || !settings.heureFermeture) return;

  const weekday = WEEKDAY_NAMES_FR[input.createdAt.getDay()]!;
  const jourFerme = settings.joursFermeture.includes(weekday);

  const minutesOfDay = input.createdAt.getHours() * 60 + input.createdAt.getMinutes();
  const ouverture = parseHeure(settings.heureOuverture) - SEUILS.HORS_HORAIRES_TOLERANCE_MIN;
  const fermeture = parseHeure(settings.heureFermeture) + SEUILS.HORS_HORAIRES_TOLERANCE_MIN;
  const horsFenetre = minutesOfDay < ouverture || minutesOfDay > fermeture;

  if (!jourFerme && !horsFenetre) return;

  const { start, end } = dayBounds(input.createdAt);
  const dejaAujourdhui = await prisma.guichetAlerte.count({
    where: {
      organizationId: input.organizationId,
      typeAlerte: 'hors_horaires',
      createdAt: { gte: start, lt: end },
    },
  });
  const severite: GuichetAlerteSeverite =
    jourFerme || dejaAujourdhui > 0 ? 'critique' : 'attention';

  await fireGuichetAlerte(prisma, {
    organizationId: input.organizationId,
    typeAlerte: 'hors_horaires',
    severite,
    title: severite === 'critique' ? 'Activité hors horaires (critique)' : 'Activité hors horaires',
    body: jourFerme
      ? `Transaction émise un jour de fermeture déclaré (${weekday}).`
      : `Transaction émise en dehors des horaires déclarés (${settings.heureOuverture}–${settings.heureFermeture}).`,
    details: { transactionId: input.transactionId, jourFerme },
  });
}

// § 6.3 (rafale) — checked synchronously right after a cancellation
// (frontend/src/app/api/guichet/transactions/[id]/annuler/route.ts).
export async function checkAnnulationsRafale(
  prisma: PrismaClient,
  input: { organizationId: string; transactionId: string },
): Promise<void> {
  const windowStart = new Date(Date.now() - SEUILS.ANNULATION_RAFALE_WINDOW_MIN * 60_000);
  const count = await prisma.guichetTransaction.count({
    where: {
      organizationId: input.organizationId,
      statut: 'annulee',
      annulationAt: { gte: windowStart },
    },
  });
  if (count < SEUILS.ANNULATION_RAFALE_COUNT) return;

  await fireGuichetAlerte(prisma, {
    organizationId: input.organizationId,
    typeAlerte: 'annulations_suspectes',
    severite: 'attention',
    title: 'Annulations suspectes',
    body: `${count} annulations en moins de ${SEUILS.ANNULATION_RAFALE_WINDOW_MIN} minutes.`,
    details: { transactionId: input.transactionId, count },
  });
}

export interface RunGuichetAlertesCheckResult {
  organizationsChecked: number;
  alertsFired: number;
}

/**
 * Daily cron sweep — .planning/prd-guichet-entree.md § 7 ("job planifié
 * quotidien recalculant les moyennes glissantes"). Covers: § 6.3's daily-rate
 * and 3-consecutive-days sub-rules, § 6.4 (inactivité), and the two
 * tamper-detection sweeps § 6.5/6.6. Called by
 * app/api/cron/guichet-alertes/route.ts.
 */
export async function runGuichetAlertesCheck(deps: {
  prisma: PrismaClient;
  now?: Date;
}): Promise<RunGuichetAlertesCheckResult> {
  const { prisma } = deps;
  const now = deps.now ?? new Date();
  let alertsFired = 0;

  const orgIds = await prisma.guichetTransaction.findMany({
    where: {},
    distinct: ['organizationId'],
    select: { organizationId: true },
  });

  for (const { organizationId } of orgIds) {
    alertsFired += await checkAnnulationTauxEtSerie(prisma, organizationId, now);
    alertsFired += await checkInactivite(prisma, organizationId, now);
    alertsFired += await checkRuptureSequence(prisma, organizationId);
    alertsFired += await checkMontantHorsGrille(prisma, organizationId);
  }

  return { organizationsChecked: orgIds.length, alertsFired };
}

// § 6.3 (taux quotidien + 3 jours consécutifs) — evaluated against
// YESTERDAY, the last fully-completed day.
async function checkAnnulationTauxEtSerie(
  prisma: PrismaClient,
  organizationId: string,
  now: Date,
): Promise<number> {
  let fired = 0;
  const { start: todayStart } = dayBounds(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

  const yesterdays = await prisma.guichetTransaction.findMany({
    where: { organizationId, createdAt: { gte: yesterdayStart, lt: todayStart } },
    select: { statut: true },
  });
  if (yesterdays.length > 0) {
    const cancelled = yesterdays.filter((t) => t.statut === 'annulee').length;
    const taux = cancelled / yesterdays.length;
    if (taux > SEUILS.ANNULATION_TAUX_ATTENTION_PCT) {
      await fireGuichetAlerte(prisma, {
        organizationId,
        typeAlerte: 'annulations_suspectes',
        severite: 'attention',
        title: "Taux d'annulation élevé",
        body: `${cancelled}/${yesterdays.length} transactions annulées hier (${Math.round(taux * 100)}%).`,
        details: {
          date: yesterdayStart.toISOString().slice(0, 10),
          cancelled,
          total: yesterdays.length,
        },
      });
      fired++;
    }
  }

  // "Même type de recette annulé anormalement 3 jours consécutifs" — read as:
  // at least one cancellation of that type on each of the last N consecutive
  // days (the PRD doesn't further quantify "anormalement").
  const windowStart = new Date(
    todayStart.getTime() - SEUILS.ANNULATION_MEME_TYPE_JOURS_CONSECUTIFS * DAY_MS,
  );
  const recentCancellations = await prisma.guichetTransaction.findMany({
    where: {
      organizationId,
      statut: 'annulee',
      createdAt: { gte: windowStart, lt: todayStart },
    },
    select: { typeRecetteId: true, createdAt: true, typeRecette: { select: { libelle: true } } },
  });
  const byType = new Map<string, { libelle: string; days: Set<string> }>();
  for (const c of recentCancellations) {
    const entry = byType.get(c.typeRecetteId) ?? {
      libelle: c.typeRecette.libelle,
      days: new Set<string>(),
    };
    entry.days.add(c.createdAt.toISOString().slice(0, 10));
    byType.set(c.typeRecetteId, entry);
  }
  for (const [typeRecetteId, entry] of byType) {
    if (entry.days.size >= SEUILS.ANNULATION_MEME_TYPE_JOURS_CONSECUTIFS) {
      await fireGuichetAlerte(prisma, {
        organizationId,
        typeAlerte: 'annulations_suspectes',
        severite: 'critique',
        title: 'Annulations répétées sur un même type de recette',
        body: `"${entry.libelle}" a été annulé au moins un jour sur ${SEUILS.ANNULATION_MEME_TYPE_JOURS_CONSECUTIFS} jours consécutifs.`,
        details: { typeRecetteId, joursConcernes: [...entry.days] },
      });
      fired++;
    }
  }

  return fired;
}

// § 6.4 — needs declared horaires; no-op otherwise.
async function checkInactivite(
  prisma: PrismaClient,
  organizationId: string,
  now: Date,
): Promise<number> {
  let fired = 0;
  const settings = await prisma.clinicSettings.findUnique({
    where: { organizationId },
    select: { heureOuverture: true, heureFermeture: true, joursFermeture: true },
  });
  if (!settings?.heureOuverture || !settings.heureFermeture) return 0;

  const { start: todayStart } = dayBounds(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const yesterdayWeekday = WEEKDAY_NAMES_FR[yesterdayStart.getDay()]!;

  if (!settings.joursFermeture.includes(yesterdayWeekday)) {
    const count = await prisma.guichetTransaction.count({
      where: { organizationId, createdAt: { gte: yesterdayStart, lt: todayStart } },
    });
    if (count === 0) {
      await fireGuichetAlerte(prisma, {
        organizationId,
        typeAlerte: 'inactivite',
        severite: 'critique',
        title: 'Inactivité totale sur une journée ouverte',
        body: `Aucune transaction enregistrée le ${yesterdayStart.toISOString().slice(0, 10)}, jour d'ouverture déclaré.`,
        details: { date: yesterdayStart.toISOString().slice(0, 10) },
      });
      fired++;
    }
  }

  // "Attention" sub-rule — today's pace so far vs. the rolling hourly average.
  // Approximated on a daily cron tick (per the PRD's own § 7 design), not
  // live: average gap between consecutive transactions over the rolling
  // window, compared to the gap since the last transaction as of `now`.
  const windowStart = new Date(todayStart.getTime() - SEUILS.ROLLING_WINDOW_DAYS * DAY_MS);
  const recent = await prisma.guichetTransaction.findMany({
    where: { organizationId, createdAt: { gte: windowStart, lt: todayStart } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (recent.length >= 2) {
    const gapsMs: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      gapsMs.push(recent[i]!.createdAt.getTime() - recent[i - 1]!.createdAt.getTime());
    }
    const avgGapMs = gapsMs.reduce((s, v) => s + v, 0) / gapsMs.length;

    const lastToday = await prisma.guichetTransaction.findFirst({
      where: { organizationId, createdAt: { gte: todayStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const sinceLastMs = now.getTime() - (lastToday?.createdAt.getTime() ?? todayStart.getTime());
    const currentWeekday = WEEKDAY_NAMES_FR[now.getDay()]!;
    const withinDeclaredHours =
      !settings.joursFermeture.includes(currentWeekday) &&
      now.getHours() * 60 + now.getMinutes() >= parseHeure(settings.heureOuverture) &&
      now.getHours() * 60 + now.getMinutes() <= parseHeure(settings.heureFermeture);

    if (
      withinDeclaredHours &&
      avgGapMs > 0 &&
      sinceLastMs > avgGapMs * SEUILS.INACTIVITE_FACTEUR_ATTENTION
    ) {
      await fireGuichetAlerte(prisma, {
        organizationId,
        typeAlerte: 'inactivite',
        severite: 'attention',
        title: 'Inactivité anormale',
        body: `Aucune transaction depuis ${Math.round(sinceLastMs / 60_000)} min, contre ${Math.round(avgGapMs / 60_000)} min habituellement.`,
        details: {
          sinceLastMinutes: Math.round(sinceLastMs / 60_000),
          avgGapMinutes: Math.round(avgGapMs / 60_000),
        },
      });
      fired++;
    }
  }

  return fired;
}

// § 6.5 — tamper-detection sweep, structurally unreachable through this
// app's own routes (numeroSequence is always max+1 inside a transaction).
async function checkRuptureSequence(prisma: PrismaClient, organizationId: string): Promise<number> {
  const rows = await prisma.guichetTransaction.findMany({
    where: { organizationId },
    orderBy: { numeroSequence: 'asc' },
    select: { numeroSequence: true },
  });
  if (rows.length === 0) return 0;

  const seen = new Set(rows.map((r) => r.numeroSequence));
  const min = rows[0]!.numeroSequence;
  const max = rows[rows.length - 1]!.numeroSequence;
  const missing: number[] = [];
  for (let n = min; n <= max; n++) {
    if (!seen.has(n)) missing.push(n);
  }
  if (missing.length === 0) return 0;

  await fireGuichetAlerte(prisma, {
    organizationId,
    typeAlerte: 'rupture_sequence',
    severite: 'critique',
    title: 'Rupture de séquence détectée',
    body: `${missing.length} numéro(s) de séquence manquant(s) : ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}.`,
    details: { missing },
  });
  return 1;
}

// § 6.6 — tamper-detection sweep, structurally unreachable through this
// app's own routes (montant is always server-derived from the grid).
async function checkMontantHorsGrille(
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> {
  const rows = await prisma.guichetTransaction.findMany({
    where: { organizationId, statut: 'emise' },
    select: {
      id: true,
      montant: true,
      remiseAppliquee: true,
      typeRecette: { select: { tarif: true } },
    },
  });
  const offenders = rows.filter(
    (r) => r.montant !== r.typeRecette.tarif - (r.remiseAppliquee ?? 0),
  );
  if (offenders.length === 0) return 0;

  await fireGuichetAlerte(prisma, {
    organizationId,
    typeAlerte: 'montant_hors_grille',
    severite: 'critique',
    title: 'Montant hors grille détecté',
    body: `${offenders.length} transaction(s) dont le montant ne correspond pas à la grille tarifaire.`,
    details: { transactionIds: offenders.map((o) => o.id).slice(0, 20) },
  });
  return 1;
}
