// Companion unit test for depot/stock.ts's applyStockMovement — the single
// point of entry for any MedicamentProduit.stockActuel change (see
// .planning/prd-depot-medicaments.md § 2, 7). Covers the INCREASING/
// DECREASING sign math per type, the motif-required guard for entree/sortie,
// StockInsuffisantError on a would-be-negative stock, and the exact
// DepotMouvementStock row written (stockAvant/stockApres snapshots).
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { applyStockMovement, StockInsuffisantError } from './stock';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

const BASE = {
  organizationId: 'org-1',
  produitId: 'prod-1',
  auteurId: 'user-1',
};

function mockStockActuel(n: number) {
  prismaMock.medicamentProduit.findUniqueOrThrow.mockResolvedValue({
    stockActuel: n,
  } as never);
}

describe('applyStockMovement', () => {
  it('a vente decrements stock and writes a matching ledger row', async () => {
    mockStockActuel(10);
    await applyStockMovement(prismaMock, {
      ...BASE,
      type: 'vente',
      quantite: 3,
      venteId: 'vente-1',
    });
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stockActuel: 7 },
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        produitId: 'prod-1',
        type: 'vente',
        quantite: 3,
        motif: null,
        venteId: 'vente-1',
        stockAvant: 10,
        stockApres: 7,
        auteurId: 'user-1',
      },
    });
  });

  it('an entree increments stock', async () => {
    mockStockActuel(10);
    await applyStockMovement(prismaMock, {
      ...BASE,
      type: 'entree',
      quantite: 5,
      motif: 'Réception livraison PPM',
    });
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stockActuel: 15 },
    });
  });

  it('a sortie decrements stock', async () => {
    mockStockActuel(10);
    await applyStockMovement(prismaMock, {
      ...BASE,
      type: 'sortie',
      quantite: 4,
      motif: 'Péremption',
    });
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stockActuel: 6 },
    });
  });

  it('an annulation_vente restores stock (increments)', async () => {
    mockStockActuel(7);
    await applyStockMovement(prismaMock, {
      ...BASE,
      type: 'annulation_vente',
      quantite: 3,
      venteId: 'vente-1',
    });
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stockActuel: 10 },
    });
  });

  it('throws StockInsuffisantError instead of going negative, and never writes', async () => {
    mockStockActuel(2);
    await expect(
      applyStockMovement(prismaMock, { ...BASE, type: 'vente', quantite: 5, venteId: 'vente-1' }),
    ).rejects.toThrow(StockInsuffisantError);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
    expect(prismaMock.depotMouvementStock.create).not.toHaveBeenCalled();
  });

  it('a sortie exactly draining stock to 0 is allowed (boundary, not <0)', async () => {
    mockStockActuel(4);
    await applyStockMovement(prismaMock, {
      ...BASE,
      type: 'sortie',
      quantite: 4,
      motif: 'Inventaire',
    });
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stockActuel: 0 },
    });
  });

  it('rejects an entree with no motif', async () => {
    mockStockActuel(10);
    await expect(
      applyStockMovement(prismaMock, { ...BASE, type: 'entree', quantite: 5 }),
    ).rejects.toThrow(/motif/);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('rejects a sortie with a blank (whitespace-only) motif', async () => {
    mockStockActuel(10);
    await expect(
      applyStockMovement(prismaMock, { ...BASE, type: 'sortie', quantite: 5, motif: '   ' }),
    ).rejects.toThrow(/motif/);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('a vente does not require a motif', async () => {
    mockStockActuel(10);
    await expect(
      applyStockMovement(prismaMock, { ...BASE, type: 'vente', quantite: 1, venteId: 'vente-1' }),
    ).resolves.toBeUndefined();
  });
});
