// Dépôt alert rules — .planning/prd-depot-medicaments.md § 6 (2 rules, both
// checked synchronously right after the triggering mutation — no cron sweep,
// unlike Guichet's alertes.ts, since neither rule here needs a rolling-window
// cron tick beyond checkEcartCaisse's own 30-day average):
//   - checkRuptureStock: called right after any stock-decreasing movement
//     (a vente or a manual sortie) with the product's post-movement state.
//   - checkEcartCaisse: called right after a DepotCloture's écart is known
//     (frontend/src/app/api/depot/cloture/route.ts) — same mechanic as
//     Guichet's, computed on the dépôt's own CA (never mixed with Guichet's).
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { enqueueOutbox } from '../outbox';

export type DepotAlerteType = 'rupture_stock' | 'ecart_caisse';
export type DepotAlerteSeverite = 'info' | 'attention' | 'critique';

// Same écart thresholds as Guichet's alertes.ts (PRD § 6.2 explicitly reuses
// that mechanic) — kept as a separate constant rather than importing
// Guichet's SEUILS, since the two modules' thresholds are allowed to diverge
// independently even though they start out identical.
export const SEUILS = {
  ECART_ATTENTION_PCT: 0.02,
  ECART_CRITIQUE_PCT: 0.08,
  ECART_CRITIQUE_ABS_FCFA: 10_000,
  ROLLING_WINDOW_DAYS: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

/**
 * Creates the DepotAlerte row and — for severite 'attention'/'critique' only
 * (§ 6.4, 'info' stays report/historique-only) — enqueues the `depot.alerte`
 * outbox event (in-app Notification always; email for 'critique') inside the
 * same transaction so the two are atomic.
 */
export async function fireDepotAlerte(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    typeAlerte: DepotAlerteType;
    severite: DepotAlerteSeverite;
    title: string;
    body: string;
    details?: Record<string, unknown>;
  },
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { owner: { select: { id: true, email: true } } },
  });
  if (!org) throw new Error(`fireDepotAlerte: organization ${input.organizationId} not found`);

  return prisma.$transaction(async (tx) => {
    const alerte = await tx.depotAlerte.create({
      data: {
        organizationId: input.organizationId,
        typeAlerte: input.typeAlerte,
        severite: input.severite,
        details: (input.details ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    });

    if (input.severite !== 'info') {
      await enqueueOutbox(tx, {
        kind: 'depot.alerte',
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

/** Average of daily (emise-sale) revenue sums over the ROLLING_WINDOW_DAYS prior to `before` (excludes `before`'s own day — that day may still be in progress). */
async function computeAvgDailyCA(
  prisma: PrismaClient,
  organizationId: string,
  before: Date,
): Promise<number> {
  const { start: todayStart } = dayBounds(before);
  const windowStart = new Date(todayStart.getTime() - SEUILS.ROLLING_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.depotVente.findMany({
    where: {
      organizationId,
      statut: 'emise',
      createdAt: { gte: windowStart, lt: todayStart },
    },
    select: { montantTotal: true, createdAt: true },
  });
  if (rows.length === 0) return 0;
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + r.montantTotal);
  }
  const total = [...byDay.values()].reduce((s, v) => s + v, 0);
  // Averaged over the number of days actually observed, not the full window
  // — a newly-opened dépôt with < 30 days of history shouldn't have its
  // average diluted by days that don't exist yet.
  return total / byDay.size;
}

// § 6.2 — checked synchronously right after a clôture's écart is known
// (frontend/src/app/api/depot/cloture/route.ts).
export async function checkEcartCaisse(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    clotureId: string;
    gerantName: string;
    dateService: string;
    ecart: number;
  },
): Promise<void> {
  const avgDailyCA = await computeAvgDailyCA(prisma, input.organizationId, new Date());
  const ecartAbs = Math.abs(input.ecart);
  const ecartPct = avgDailyCA > 0 ? ecartAbs / avgDailyCA : 0;

  let severite: DepotAlerteSeverite | null = null;
  // "le plus bas des deux déclenche" — either condition alone is sufficient.
  if (ecartPct > SEUILS.ECART_CRITIQUE_PCT || ecartAbs > SEUILS.ECART_CRITIQUE_ABS_FCFA) {
    severite = 'critique';
  } else if (ecartPct > SEUILS.ECART_ATTENTION_PCT) {
    severite = 'attention';
  }
  if (!severite) return;

  const sign = input.ecart > 0 ? '+' : '';
  await fireDepotAlerte(prisma, {
    organizationId: input.organizationId,
    typeAlerte: 'ecart_caisse',
    severite,
    title: severite === 'critique' ? 'Écart de caisse critique (Dépôt)' : 'Écart de caisse (Dépôt)',
    body: `Écart de ${sign}${input.ecart} FCFA constaté à la clôture de ${input.gerantName} le ${input.dateService}.`,
    details: { clotureId: input.clotureId, ecart: input.ecart, avgDailyCA },
  });
}

// § 6.1 — checked synchronously right after any stock-decreasing movement
// (a vente in frontend/src/app/api/depot/ventes/route.ts, or a manual sortie
// in frontend/src/app/api/depot/produits/[id]/mouvements/route.ts), using
// that product's post-movement stockActuel.
export async function checkRuptureStock(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    produitId: string;
    produitNom: string;
    stockApres: number;
    seuilAlerteStock: number | null;
  },
): Promise<void> {
  let severite: DepotAlerteSeverite | null = null;
  if (input.stockApres <= 0) {
    severite = 'critique';
  } else if (input.seuilAlerteStock !== null && input.stockApres <= input.seuilAlerteStock) {
    severite = 'attention';
  }
  if (!severite) return;

  await fireDepotAlerte(prisma, {
    organizationId: input.organizationId,
    typeAlerte: 'rupture_stock',
    severite,
    title: severite === 'critique' ? 'Rupture de stock' : "Stock proche du seuil d'alerte",
    body:
      severite === 'critique'
        ? `Le produit "${input.produitNom}" est en rupture de stock (0 disponible).`
        : `Le produit "${input.produitNom}" approche du seuil d'alerte (${input.stockApres} restant(s), seuil ${input.seuilAlerteStock}).`,
    details: {
      produitId: input.produitId,
      produitNom: input.produitNom,
      stockApres: input.stockApres,
      seuilAlerteStock: input.seuilAlerteStock,
    },
  });
}
