// The single point of entry for any MedicamentProduit.stockActuel change —
// .planning/prd-depot-medicaments.md § 2 requires it: nothing writes
// stockActuel directly anywhere else in the codebase. Every mutation (sale,
// cancellation, manual receipt/outflow) goes through applyStockMovement(),
// which writes both the new stockActuel AND the DepotMouvementStock audit
// row in the same transaction the caller is already inside — mirrors the
// "single required entry point" discipline already imposed on
// createNotification()/enqueueOutbox() elsewhere in MediAfrica.
import 'server-only';
import type { Prisma } from '@prisma/client';

export type StockMovementType = 'vente' | 'annulation_vente' | 'entree' | 'sortie';

export interface ApplyStockMovementInput {
  organizationId: string;
  produitId: string;
  type: StockMovementType;
  quantite: number; // always positive — `type` determines the sign of the effect
  auteurId: string;
  motif?: string;
  venteId?: string;
}

// entree/annulation_vente increase stock; vente/sortie decrease it.
const INCREASING = new Set<StockMovementType>(['entree', 'annulation_vente']);

export class StockInsuffisantError extends Error {
  constructor(
    public readonly produitId: string,
    public readonly stockDisponible: number,
    public readonly quantiteDemandee: number,
  ) {
    super(
      `Stock insuffisant pour le produit ${produitId} : ${stockDisponible} disponible(s), ${quantiteDemandee} demandé(s).`,
    );
    this.name = 'StockInsuffisantError';
  }
}

export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  input: ApplyStockMovementInput,
): Promise<void> {
  if ((input.type === 'entree' || input.type === 'sortie') && !input.motif?.trim()) {
    throw new Error(`applyStockMovement: motif is required for type "${input.type}"`);
  }

  // Read-then-write inside the caller's transaction — Prisma's default
  // transaction isolation serializes concurrent writers on this row, so a
  // simultaneous sale on the same product can't both read the same
  // stockAvant and both succeed past the negative-stock check below.
  const produit = await tx.medicamentProduit.findUniqueOrThrow({
    where: { id: input.produitId },
    select: { stockActuel: true },
  });

  const stockAvant = produit.stockActuel;
  const delta = INCREASING.has(input.type) ? input.quantite : -input.quantite;
  const stockApres = stockAvant + delta;

  if (stockApres < 0) {
    throw new StockInsuffisantError(input.produitId, stockAvant, input.quantite);
  }

  await tx.medicamentProduit.update({
    where: { id: input.produitId },
    data: { stockActuel: stockApres },
  });

  await tx.depotMouvementStock.create({
    data: {
      organizationId: input.organizationId,
      produitId: input.produitId,
      type: input.type,
      quantite: input.quantite,
      motif: input.motif ?? null,
      venteId: input.venteId ?? null,
      stockAvant,
      stockApres,
      auteurId: input.auteurId,
    },
  });
}
