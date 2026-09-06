// Companion unit test for depot/fefo.ts — the FEFO consumption layer on top
// of applyStockMovement (stock.ts). Covers: single-lot consumption, a split
// across 2 lots (correct per-lot amounts, call order, FEFO ordering passed
// to the query), StockInsuffisantError when the sum across every lot is too
// low, receiveLot's lot creation + entree ledger row, and
// reverseVenteConsumption's replay-the-actual-ledger-rows behavior
// (including the legacy lotId=null case).
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { StockInsuffisantError } from './stock';
import { consumeFefo, receiveLot, reverseVenteConsumption } from './fefo';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

const BASE = {
  organizationId: 'org-1',
  produitId: 'prod-1',
  auteurId: 'user-1',
};

function lot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lot-1',
    numeroLot: 'LOT-A',
    datePeremption: new Date('2026-06-01T00:00:00Z'),
    quantiteRestante: 10,
    ...overrides,
  };
}

function mockStockActuel(...values: number[]) {
  let mock = prismaMock.medicamentProduit.findUniqueOrThrow;
  for (const v of values) {
    mock = mock.mockResolvedValueOnce({ stockActuel: v } as never);
  }
}

describe('consumeFefo', () => {
  it('a single lot covers the full quantity', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([lot()] as never);
    mockStockActuel(10);

    const result = await consumeFefo(prismaMock, {
      ...BASE,
      type: 'vente',
      quantite: 5,
      venteId: 'vente-1',
    });

    expect(result.splits).toEqual([
      { lotId: 'lot-1', numeroLot: 'LOT-A', datePeremption: lot().datePeremption, quantite: 5 },
    ]);
    expect(prismaMock.medicamentLot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { quantiteRestante: { decrement: 5 } },
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lotId: 'lot-1', type: 'vente', quantite: 5 }),
    });
  });

  it('splits across 2 lots, soonest-expiring first, when the first lot is insufficient', async () => {
    const lotA = lot({ id: 'lot-a', numeroLot: 'LOT-A', quantiteRestante: 3 });
    const lotB = lot({
      id: 'lot-b',
      numeroLot: 'LOT-B',
      datePeremption: null,
      quantiteRestante: 10,
    });
    prismaMock.medicamentLot.findMany.mockResolvedValue([lotA, lotB] as never);
    mockStockActuel(20, 17);

    const result = await consumeFefo(prismaMock, {
      ...BASE,
      type: 'vente',
      quantite: 5,
      venteId: 'vente-1',
    });

    expect(result.splits).toEqual([
      { lotId: 'lot-a', numeroLot: 'LOT-A', datePeremption: lotA.datePeremption, quantite: 3 },
      { lotId: 'lot-b', numeroLot: 'LOT-B', datePeremption: null, quantite: 2 },
    ]);
    expect(prismaMock.medicamentLot.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'lot-a' },
      data: { quantiteRestante: { decrement: 3 } },
    });
    expect(prismaMock.medicamentLot.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'lot-b' },
      data: { quantiteRestante: { decrement: 2 } },
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledTimes(2);
  });

  it('queries lots ordered soonest-expiring-first with nulls last, then by creation order', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([lot()] as never);
    mockStockActuel(10);
    await consumeFefo(prismaMock, { ...BASE, type: 'sortie', quantite: 1, motif: 'Casse' });
    expect(prismaMock.medicamentLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', produitId: 'prod-1', quantiteRestante: { gt: 0 } },
        orderBy: [{ datePeremption: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
    );
  });

  it('throws StockInsuffisantError and writes nothing when the sum across every lot is too low', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([lot({ quantiteRestante: 2 })] as never);

    await expect(
      consumeFefo(prismaMock, { ...BASE, type: 'vente', quantite: 5, venteId: 'vente-1' }),
    ).rejects.toThrow(StockInsuffisantError);
    expect(prismaMock.medicamentLot.update).not.toHaveBeenCalled();
    expect(prismaMock.depotMouvementStock.create).not.toHaveBeenCalled();
  });
});

describe('receiveLot', () => {
  it('creates the lot and records an entree ledger row against the new lotId', async () => {
    prismaMock.medicamentLot.create.mockResolvedValue({ id: 'lot-new' } as never);
    mockStockActuel(0);

    const result = await receiveLot(prismaMock, {
      ...BASE,
      numeroLot: 'LOT-Z',
      datePeremption: new Date('2027-01-01T00:00:00Z'),
      quantite: 20,
      motif: 'Réception PPM',
    });

    expect(result.lotId).toBe('lot-new');
    expect(prismaMock.medicamentLot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        produitId: 'prod-1',
        numeroLot: 'LOT-Z',
        datePeremption: new Date('2027-01-01T00:00:00Z'),
        quantiteInitiale: 20,
        quantiteRestante: 20,
      }),
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'entree', quantite: 20, lotId: 'lot-new' }),
    });
  });
});

describe('reverseVenteConsumption', () => {
  it('restores quantiteRestante on every lot a split sale actually touched', async () => {
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([
      { id: 'm1', quantite: 3, lotId: 'lot-a' },
      { id: 'm2', quantite: 2, lotId: 'lot-b' },
    ] as never);
    mockStockActuel(0, 3);

    await reverseVenteConsumption(prismaMock, {
      organizationId: 'org-1',
      venteId: 'vente-1',
      produitId: 'prod-1',
      auteurId: 'user-1',
    });

    expect(prismaMock.medicamentLot.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'lot-a' },
      data: { quantiteRestante: { increment: 3 } },
    });
    expect(prismaMock.medicamentLot.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'lot-b' },
      data: { quantiteRestante: { increment: 2 } },
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.depotMouvementStock.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ type: 'annulation_vente', quantite: 3, lotId: 'lot-a' }),
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ type: 'annulation_vente', quantite: 2, lotId: 'lot-b' }),
    });
  });

  it('a legacy row with lotId=null restores the aggregate without touching medicamentLot', async () => {
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([
      { id: 'm1', quantite: 3, lotId: null },
    ] as never);
    mockStockActuel(0);

    await reverseVenteConsumption(prismaMock, {
      organizationId: 'org-1',
      venteId: 'vente-1',
      produitId: 'prod-1',
      auteurId: 'user-1',
    });

    expect(prismaMock.medicamentLot.update).not.toHaveBeenCalled();
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'annulation_vente', quantite: 3, lotId: null }),
    });
  });
});
