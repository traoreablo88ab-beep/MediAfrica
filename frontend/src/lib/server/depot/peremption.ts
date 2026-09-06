// Daily cron sweep for lot expiration — unlike depot/alertes.ts's 2 rules
// (checked synchronously right after the triggering mutation), expiration is
// PASSIVE in time: a lot can become expired/near-expiry with no user action,
// so it needs its own daily tick, on the model of guichet/alertes.ts's
// runGuichetAlertesCheck. Called by app/api/cron/depot-peremption/route.ts.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { fireDepotAlerte } from './alertes';

export const SEUIL_PEREMPTION = {
  ATTENTION_JOURS: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RunDepotPeremptionCheckResult {
  organizationsChecked: number;
  alertsFired: number;
}

export async function runDepotPeremptionCheck(deps: {
  prisma: PrismaClient;
  now?: Date;
}): Promise<RunDepotPeremptionCheckResult> {
  const { prisma } = deps;
  const now = deps.now ?? new Date();
  const attentionCutoff = new Date(now.getTime() + SEUIL_PEREMPTION.ATTENTION_JOURS * DAY_MS);
  let alertsFired = 0;

  const orgIds = await prisma.medicamentLot.findMany({
    where: { quantiteRestante: { gt: 0 } },
    distinct: ['organizationId'],
    select: { organizationId: true },
  });

  for (const { organizationId } of orgIds) {
    const expired = await prisma.medicamentLot.findMany({
      where: {
        organizationId,
        quantiteRestante: { gt: 0 },
        datePeremption: { lt: now },
        alerteExpireEnvoyeeAt: null,
      },
      select: {
        id: true,
        numeroLot: true,
        datePeremption: true,
        quantiteRestante: true,
        produit: { select: { id: true, nom: true } },
      },
    });
    for (const lot of expired) {
      await fireDepotAlerte(prisma, {
        organizationId,
        typeAlerte: 'peremption_lot',
        severite: 'critique',
        title: 'Lot de médicament expiré',
        body: `Le lot "${lot.numeroLot}" du produit "${lot.produit.nom}" est expiré (${lot.quantiteRestante} unité(s) restante(s)).`,
        details: {
          lotId: lot.id,
          produitId: lot.produit.id,
          produitNom: lot.produit.nom,
          numeroLot: lot.numeroLot,
          datePeremption: lot.datePeremption?.toISOString().slice(0, 10),
          quantiteRestante: lot.quantiteRestante,
        },
      });
      await prisma.medicamentLot.update({
        where: { id: lot.id },
        data: { alerteExpireEnvoyeeAt: now },
      });
      alertsFired++;
    }

    const procheDePeremption = await prisma.medicamentLot.findMany({
      where: {
        organizationId,
        quantiteRestante: { gt: 0 },
        datePeremption: { gte: now, lte: attentionCutoff },
        alerteProchePeremptionEnvoyeeAt: null,
      },
      select: {
        id: true,
        numeroLot: true,
        datePeremption: true,
        quantiteRestante: true,
        produit: { select: { id: true, nom: true } },
      },
    });
    for (const lot of procheDePeremption) {
      await fireDepotAlerte(prisma, {
        organizationId,
        typeAlerte: 'peremption_lot',
        severite: 'attention',
        title: 'Lot de médicament proche de la péremption',
        body: `Le lot "${lot.numeroLot}" du produit "${lot.produit.nom}" expire le ${lot.datePeremption?.toISOString().slice(0, 10)} (${lot.quantiteRestante} unité(s) restante(s)).`,
        details: {
          lotId: lot.id,
          produitId: lot.produit.id,
          produitNom: lot.produit.nom,
          numeroLot: lot.numeroLot,
          datePeremption: lot.datePeremption?.toISOString().slice(0, 10),
          quantiteRestante: lot.quantiteRestante,
        },
      });
      await prisma.medicamentLot.update({
        where: { id: lot.id },
        data: { alerteProchePeremptionEnvoyeeAt: now },
      });
      alertsFired++;
    }
  }

  return { organizationsChecked: orgIds.length, alertsFired };
}
