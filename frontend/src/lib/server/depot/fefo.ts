// FEFO (First-Expired-First-Out) consumption on top of applyStockMovement —
// see .planning/prd-depot-medicaments.md's FEFO addendum. applyStockMovement
// (stock.ts) stays the single point of entry for MedicamentProduit.stockActuel;
// this module decides WHICH lot(s) a stock-decreasing event draws from (or a
// stock-increasing event replenishes), then calls applyStockMovement once per
// lot touched — a sale/sortie whose quantity spans multiple lots ends up as
// multiple DepotMouvementStock rows, same venteId, distinct lotId.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { applyStockMovement, StockInsuffisantError } from './stock';

export interface ConsumeFefoInput {
  organizationId: string;
  produitId: string;
  type: 'vente' | 'sortie';
  quantite: number;
  auteurId: string;
  motif?: string; // required for 'sortie' — forwarded, same rule as applyStockMovement
  venteId?: string; // required for 'vente'
}

export interface ConsumeFefoSplit {
  lotId: string;
  numeroLot: string;
  datePeremption: Date | null;
  quantite: number;
}

export interface ConsumeFefoResult {
  splits: ConsumeFefoSplit[];
}

/**
 * Consumes `quantite` units of a product's stock, drawing from the
 * soonest-to-expire lot first (undated lots sort last), splitting across
 * multiple lots automatically when one lot's remaining quantity isn't
 * enough. Throws StockInsuffisantError — before any write — if the sum of
 * every lot's quantiteRestante is below what's requested.
 */
export async function consumeFefo(
  tx: Prisma.TransactionClient,
  input: ConsumeFefoInput,
): Promise<ConsumeFefoResult> {
  const lots = await tx.medicamentLot.findMany({
    where: {
      organizationId: input.organizationId,
      produitId: input.produitId,
      quantiteRestante: { gt: 0 },
    },
    orderBy: [{ datePeremption: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true, numeroLot: true, datePeremption: true, quantiteRestante: true },
  });

  const disponible = lots.reduce((sum, l) => sum + l.quantiteRestante, 0);
  if (disponible < input.quantite) {
    throw new StockInsuffisantError(input.produitId, disponible, input.quantite);
  }

  const splits: ConsumeFefoSplit[] = [];
  let remaining = input.quantite;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantiteRestante, remaining);
    await tx.medicamentLot.update({
      where: { id: lot.id },
      data: { quantiteRestante: { decrement: take } },
    });
    await applyStockMovement(tx, {
      organizationId: input.organizationId,
      produitId: input.produitId,
      type: input.type,
      quantite: take,
      auteurId: input.auteurId,
      ...(input.motif !== undefined ? { motif: input.motif } : {}),
      ...(input.venteId !== undefined ? { venteId: input.venteId } : {}),
      lotId: lot.id,
    });
    splits.push({
      lotId: lot.id,
      numeroLot: lot.numeroLot,
      datePeremption: lot.datePeremption,
      quantite: take,
    });
    remaining -= take;
  }

  return { splits };
}

export interface ReceiveLotInput {
  organizationId: string;
  produitId: string;
  numeroLot: string;
  datePeremption: Date;
  quantite: number;
  auteurId: string;
  motif: string;
}

export interface ReceiveLotResult {
  lotId: string;
}

/** Records a stock-in against a brand-new lot (numeroLot/datePeremption required — every entrée creates its own lot row). */
export async function receiveLot(
  tx: Prisma.TransactionClient,
  input: ReceiveLotInput,
): Promise<ReceiveLotResult> {
  const lot = await tx.medicamentLot.create({
    data: {
      organizationId: input.organizationId,
      produitId: input.produitId,
      numeroLot: input.numeroLot,
      datePeremption: input.datePeremption,
      quantiteInitiale: input.quantite,
      quantiteRestante: input.quantite,
    },
  });

  await applyStockMovement(tx, {
    organizationId: input.organizationId,
    produitId: input.produitId,
    type: 'entree',
    quantite: input.quantite,
    auteurId: input.auteurId,
    motif: input.motif,
    lotId: lot.id,
  });

  return { lotId: lot.id };
}

export interface ReverseVenteConsumptionInput {
  organizationId: string;
  venteId: string;
  produitId: string;
  auteurId: string;
}

/**
 * Reverses a cancelled sale's stock effect for one product line by replaying
 * the ledger rows that sale ACTUALLY wrote (not the sale line's quantite) —
 * this is what correctly restores a line that was split across multiple
 * lots. Rows with lotId=null (sales made before FEFO existed) are still
 * restored in aggregate, with no lot to credit back.
 */
export async function reverseVenteConsumption(
  tx: Prisma.TransactionClient,
  input: ReverseVenteConsumptionInput,
): Promise<void> {
  const rows = await tx.depotMouvementStock.findMany({
    where: {
      organizationId: input.organizationId,
      venteId: input.venteId,
      produitId: input.produitId,
      type: 'vente',
    },
    select: { id: true, quantite: true, lotId: true },
  });

  for (const row of rows) {
    if (row.lotId) {
      await tx.medicamentLot.update({
        where: { id: row.lotId },
        data: { quantiteRestante: { increment: row.quantite } },
      });
    }
    await applyStockMovement(tx, {
      organizationId: input.organizationId,
      produitId: input.produitId,
      type: 'annulation_vente',
      quantite: row.quantite,
      auteurId: input.auteurId,
      venteId: input.venteId,
      ...(row.lotId ? { lotId: row.lotId } : {}),
    });
  }
}
