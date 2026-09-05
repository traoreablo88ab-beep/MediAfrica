// Companion unit test for depot/alertes.ts (PRD § 6, 2 alert rules — no
// cron sweep, unlike Guichet's alertes.ts). Covers: fireDepotAlerte's
// transactional atomicity + severite-gated outbox enqueue, and the exact
// threshold boundaries of the 2 synchronous checks.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { fireDepotAlerte, checkEcartCaisse, checkRuptureStock } from './alertes';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

const ORG = 'org-1';
const OWNER = { id: 'owner-1', email: 'owner@example.com' };

function mockOrgFound() {
  prismaMock.organization.findUnique.mockResolvedValue({ owner: OWNER } as never);
}

function mockAlerteCreate(id = 'al-1') {
  prismaMock.depotAlerte.create.mockResolvedValue({ id } as never);
}

describe('fireDepotAlerte', () => {
  it('throws when the organization does not exist', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    await expect(
      fireDepotAlerte(prismaMock, {
        organizationId: ORG,
        typeAlerte: 'rupture_stock',
        severite: 'attention',
        title: 't',
        body: 'b',
      }),
    ).rejects.toThrow(/org-1 not found/);
  });

  it("severite 'info' creates the alerte row but does not enqueue an outbox event", async () => {
    mockOrgFound();
    mockAlerteCreate();
    const id = await fireDepotAlerte(prismaMock, {
      organizationId: ORG,
      typeAlerte: 'rupture_stock',
      severite: 'info',
      title: 't',
      body: 'b',
    });
    expect(id).toBe('al-1');
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          typeAlerte: 'rupture_stock',
          severite: 'info',
        }),
      }),
    );
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it.each(['attention', 'critique'] as const)(
    "severite '%s' enqueues a depot.alerte outbox event atomically with the alerte row",
    async (severite) => {
      mockOrgFound();
      mockAlerteCreate('al-2');
      await fireDepotAlerte(prismaMock, {
        organizationId: ORG,
        typeAlerte: 'ecart_caisse',
        severite,
        title: 't',
        body: 'b',
      });
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'depot.alerte' }),
        }),
      );
    },
  );
});

describe('checkEcartCaisse', () => {
  it('no rolling history (avgDailyCA=0) → only the absolute threshold can fire', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([]);
    await checkEcartCaisse(prismaMock, {
      organizationId: ORG,
      clotureId: 'c-1',
      gerantName: 'Awa',
      dateService: '2026-01-12',
      ecart: -500,
    });
    expect(prismaMock.depotAlerte.create).not.toHaveBeenCalled();
  });

  it('un écart > 10 000 FCFA déclenche une alerte critique même sans historique', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([]);
    mockOrgFound();
    mockAlerteCreate();
    await checkEcartCaisse(prismaMock, {
      organizationId: ORG,
      clotureId: 'c-1',
      gerantName: 'Awa',
      dateService: '2026-01-12',
      ecart: -15_000,
    });
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'ecart_caisse', severite: 'critique' }),
      }),
    );
  });

  it('un écart au-delà de 2% de la moyenne glissante déclenche une alerte attention', async () => {
    // 30 days of 10,000 FCFA/day → avgDailyCA=10,000. 2.5% = 250 > 2% seuil,
    // but well under 8%/10,000 FCFA absolute, so severite=attention.
    const rows = Array.from({ length: 30 }, (_, i) => ({
      montantTotal: 10_000,
      createdAt: new Date(`2025-12-${String(i + 1).padStart(2, '0')}T09:00:00Z`),
    }));
    prismaMock.depotVente.findMany.mockResolvedValue(rows as never);
    mockOrgFound();
    mockAlerteCreate();
    await checkEcartCaisse(prismaMock, {
      organizationId: ORG,
      clotureId: 'c-1',
      gerantName: 'Awa',
      dateService: '2026-01-12',
      ecart: -250,
    });
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'ecart_caisse', severite: 'attention' }),
      }),
    );
  });
});

describe('checkRuptureStock', () => {
  it('stockApres = 0 → toujours critique, seuil déclaré ou non', async () => {
    mockOrgFound();
    mockAlerteCreate();
    await checkRuptureStock(prismaMock, {
      organizationId: ORG,
      produitId: 'p-1',
      produitNom: 'Paracétamol',
      stockApres: 0,
      seuilAlerteStock: null,
    });
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'rupture_stock', severite: 'critique' }),
      }),
    );
  });

  it('stockApres <= seuilAlerteStock (et > 0) → attention', async () => {
    mockOrgFound();
    mockAlerteCreate();
    await checkRuptureStock(prismaMock, {
      organizationId: ORG,
      produitId: 'p-1',
      produitNom: 'Paracétamol',
      stockApres: 5,
      seuilAlerteStock: 10,
    });
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'rupture_stock', severite: 'attention' }),
      }),
    );
  });

  it('stockApres > seuilAlerteStock → aucune alerte', async () => {
    await checkRuptureStock(prismaMock, {
      organizationId: ORG,
      produitId: 'p-1',
      produitNom: 'Paracétamol',
      stockApres: 50,
      seuilAlerteStock: 10,
    });
    expect(prismaMock.depotAlerte.create).not.toHaveBeenCalled();
  });

  it('seuilAlerteStock non déclaré (null) et stock > 0 → aucune alerte "attention" — seule la rupture totale est couverte', async () => {
    await checkRuptureStock(prismaMock, {
      organizationId: ORG,
      produitId: 'p-1',
      produitNom: 'Paracétamol',
      stockApres: 1,
      seuilAlerteStock: null,
    });
    expect(prismaMock.depotAlerte.create).not.toHaveBeenCalled();
  });
});
