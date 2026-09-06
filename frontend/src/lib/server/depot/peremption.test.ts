// Companion unit test for depot/peremption.ts's runDepotPeremptionCheck —
// the daily cron sweep for lot expiration (date-passive, unlike
// depot/alertes.ts's 2 synchronous rules). Covers: critique on an expired
// lot + flag stamped, attention on a lot within the 30-day window + its own
// flag, the dedup gate (alerteExpireEnvoyeeAt/alerteProchePeremptionEnvoyeeAt
// null in the where clause), the quantiteRestante>0 guard, and
// organizationsChecked across multiple orgs.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { runDepotPeremptionCheck, SEUIL_PEREMPTION } from './peremption';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

const OWNER = { id: 'owner-1', email: 'owner@example.com' };
const NOW = new Date('2026-06-15T00:00:00Z');

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.organization.findUnique.mockResolvedValue({ owner: OWNER } as never);
  prismaMock.depotAlerte.create.mockResolvedValue({ id: 'al-1' } as never);
});

function produitLot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lot-1',
    numeroLot: 'LOT-A',
    datePeremption: NOW,
    quantiteRestante: 5,
    produit: { id: 'prod-1', nom: 'Paracétamol' },
    ...overrides,
  };
}

describe('runDepotPeremptionCheck', () => {
  it('an expired lot with an unset flag fires critique and stamps alerteExpireEnvoyeeAt', async () => {
    prismaMock.medicamentLot.findMany
      .mockResolvedValueOnce([{ organizationId: 'org-1' }] as never) // distinct orgs
      .mockResolvedValueOnce([
        produitLot({ datePeremption: new Date('2026-06-01T00:00:00Z') }),
      ] as never) // expired
      .mockResolvedValueOnce([] as never); // proche de péremption

    const result = await runDepotPeremptionCheck({ prisma: prismaMock, now: NOW });

    expect(result).toEqual({ organizationsChecked: 1, alertsFired: 1 });
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'peremption_lot', severite: 'critique' }),
      }),
    );
    expect(prismaMock.medicamentLot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { alerteExpireEnvoyeeAt: NOW },
    });
  });

  it('a lot within the 30-day window fires attention and stamps its own flag', async () => {
    const soon = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);
    prismaMock.medicamentLot.findMany
      .mockResolvedValueOnce([{ organizationId: 'org-1' }] as never)
      .mockResolvedValueOnce([] as never) // expired
      .mockResolvedValueOnce([produitLot({ datePeremption: soon })] as never); // proche

    const result = await runDepotPeremptionCheck({ prisma: prismaMock, now: NOW });

    expect(result).toEqual({ organizationsChecked: 1, alertsFired: 1 });
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'peremption_lot', severite: 'attention' }),
      }),
    );
    expect(prismaMock.medicamentLot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { alerteProchePeremptionEnvoyeeAt: NOW },
    });
  });

  it('queries only lots with quantiteRestante>0 and an unset flag (dedup gate)', async () => {
    prismaMock.medicamentLot.findMany
      .mockResolvedValueOnce([{ organizationId: 'org-1' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    await runDepotPeremptionCheck({ prisma: prismaMock, now: NOW });

    expect(prismaMock.medicamentLot.findMany).toHaveBeenNthCalledWith(1, {
      where: { quantiteRestante: { gt: 0 } },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    const expiredArgs = prismaMock.medicamentLot.findMany.mock.calls[1]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(expiredArgs.where).toEqual(
      expect.objectContaining({
        quantiteRestante: { gt: 0 },
        datePeremption: { lt: NOW },
        alerteExpireEnvoyeeAt: null,
      }),
    );
    const procheArgs = prismaMock.medicamentLot.findMany.mock.calls[2]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(procheArgs.where).toEqual(
      expect.objectContaining({
        quantiteRestante: { gt: 0 },
        alerteProchePeremptionEnvoyeeAt: null,
      }),
    );
    const cutoff = new Date(NOW.getTime() + SEUIL_PEREMPTION.ATTENTION_JOURS * 24 * 60 * 60 * 1000);
    expect((procheArgs.where.datePeremption as { gte: Date; lte: Date }).lte.getTime()).toBe(
      cutoff.getTime(),
    );
  });

  it('organizationsChecked reflects every distinct org, even when none fire', async () => {
    prismaMock.medicamentLot.findMany
      .mockResolvedValueOnce([{ organizationId: 'org-1' }, { organizationId: 'org-2' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await runDepotPeremptionCheck({ prisma: prismaMock, now: NOW });

    expect(result).toEqual({ organizationsChecked: 2, alertsFired: 0 });
    expect(prismaMock.depotAlerte.create).not.toHaveBeenCalled();
  });
});
