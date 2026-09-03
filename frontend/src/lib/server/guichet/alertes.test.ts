// Companion unit test for guichet/alertes.ts (PRD § 6, 6 alert rules).
// Covers: fireGuichetAlerte's transactional atomicity + severite-gated outbox
// enqueue, the 3 synchronous rules' exact threshold boundaries, and the
// cron sweep's 4 sub-checks (taux+série, inactivité, rupture, hors-grille).
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import {
  fireGuichetAlerte,
  checkEcartCaisse,
  checkHorsHoraires,
  checkAnnulationsRafale,
  runGuichetAlertesCheck,
} from './alertes';

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
  prismaMock.guichetAlerte.create.mockResolvedValue({ id } as never);
}

describe('fireGuichetAlerte', () => {
  it('throws when the organization does not exist', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    await expect(
      fireGuichetAlerte(prismaMock, {
        organizationId: ORG,
        typeAlerte: 'ecart_caisse',
        severite: 'attention',
        title: 't',
        body: 'b',
      }),
    ).rejects.toThrow(/org-1 not found/);
  });

  it("severite 'info' creates the alerte row but does not enqueue an outbox event", async () => {
    mockOrgFound();
    mockAlerteCreate();
    const id = await fireGuichetAlerte(prismaMock, {
      organizationId: ORG,
      typeAlerte: 'ecart_caisse',
      severite: 'info',
      title: 't',
      body: 'b',
    });
    expect(id).toBe('al-1');
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          typeAlerte: 'ecart_caisse',
          severite: 'info',
        }),
      }),
    );
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
  });

  it.each(['attention', 'critique'] as const)(
    "severite '%s' enqueues a guichet.alerte outbox event atomically with the alerte row",
    async (severite) => {
      mockOrgFound();
      mockAlerteCreate('al-2');
      prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

      const id = await fireGuichetAlerte(prismaMock, {
        organizationId: ORG,
        typeAlerte: 'hors_horaires',
        severite,
        title: 'Titre',
        body: 'Corps',
        details: { foo: 'bar' },
      });

      expect(id).toBe('al-2');
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'guichet.alerte',
            payload: expect.objectContaining({
              alerteId: 'al-2',
              organizationId: ORG,
              typeAlerte: 'hors_horaires',
              severite,
              ownerId: OWNER.id,
              ownerEmail: OWNER.email,
              title: 'Titre',
              body: 'Corps',
            }),
          }),
        }),
      );
    },
  );
});

describe('checkEcartCaisse (§ 6.1)', () => {
  const base = {
    organizationId: ORG,
    clotureId: 'cc-1',
    guichetierName: 'Awa',
    dateService: '2026-01-12',
  };

  it('no history (avgDailyCA=0) and a small absolute écart → no alert', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([]);
    await checkEcartCaisse(prismaMock, { ...base, ecart: 500 });
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('écart absolu > 10 000 FCFA → critique regardless of pct', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([]);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    await checkEcartCaisse(prismaMock, { ...base, ecart: 15_000 });
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'ecart_caisse', severite: 'critique' }),
      }),
    );
  });

  it('écart % > 8% (abs <= 10 000) → critique via the pct branch', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([
      { montant: 10_000, createdAt: new Date(2026, 0, 11, 9, 0) },
    ] as never);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    // avgDailyCA=10 000; ecart=900 → 9% > 8%, abs=900 <= 10 000
    await checkEcartCaisse(prismaMock, { ...base, ecart: 900 });
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severite: 'critique' }) }),
    );
  });

  it('écart % > 2% and <= 8% → attention', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([
      { montant: 10_000, createdAt: new Date(2026, 0, 11, 9, 0) },
    ] as never);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    // ecart=300 → 3% of avgDailyCA
    await checkEcartCaisse(prismaMock, { ...base, ecart: 300 });
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severite: 'attention' }) }),
    );
  });

  it('écart % exactly at the 2% boundary → no alert (strict >, not >=)', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([
      { montant: 10_000, createdAt: new Date(2026, 0, 11, 9, 0) },
    ] as never);
    // ecart=200 → exactly 2%
    await checkEcartCaisse(prismaMock, { ...base, ecart: 200 });
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });
});

describe('checkHorsHoraires (§ 6.2)', () => {
  const base = { organizationId: ORG, transactionId: 'gt-1' };

  it('no-op when the center has not declared horaires', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    await checkHorsHoraires(prismaMock, { ...base, createdAt: new Date(2026, 0, 12, 20, 0) });
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('within declared hours (+ tolerance), not a jour fermé → no-op', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: [],
    } as never);
    // Monday 2026-01-12, 09:00 — well within [08:00, 17:00].
    await checkHorsHoraires(prismaMock, { ...base, createdAt: new Date(2026, 0, 12, 9, 0) });
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('exactly at the tolerance boundary (07:30) → still within window, no alert', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: [],
    } as never);
    await checkHorsHoraires(prismaMock, { ...base, createdAt: new Date(2026, 0, 12, 7, 30) });
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('jour de fermeture déclaré → critique immediately regardless of hour', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: ['lundi'],
    } as never);
    prismaMock.guichetAlerte.count.mockResolvedValue(0);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    // Monday 2026-01-12, 09:00 — inside normal hours but the day is declared closed.
    await checkHorsHoraires(prismaMock, { ...base, createdAt: new Date(2026, 0, 12, 9, 0) });
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'hors_horaires', severite: 'critique' }),
      }),
    );
  });

  it('first violation outside window on the day → attention', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: [],
    } as never);
    prismaMock.guichetAlerte.count.mockResolvedValue(0);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    // 19:00 — past 17:30 tolerance.
    await checkHorsHoraires(prismaMock, { ...base, createdAt: new Date(2026, 0, 12, 19, 0) });
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severite: 'attention' }) }),
    );
  });

  it('second violation the same day → upgraded to critique', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: [],
    } as never);
    prismaMock.guichetAlerte.count.mockResolvedValue(1);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    await checkHorsHoraires(prismaMock, { ...base, createdAt: new Date(2026, 0, 12, 19, 0) });
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severite: 'critique' }) }),
    );
  });
});

describe('checkAnnulationsRafale (§ 6.3 — rafale)', () => {
  const base = { organizationId: ORG, transactionId: 'gt-1' };

  it('count below the threshold (3) → no-op', async () => {
    prismaMock.guichetTransaction.count.mockResolvedValue(2);
    await checkAnnulationsRafale(prismaMock, base);
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('count at the threshold (3) → attention alert fires', async () => {
    prismaMock.guichetTransaction.count.mockResolvedValue(3);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);
    await checkAnnulationsRafale(prismaMock, base);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          typeAlerte: 'annulations_suspectes',
          severite: 'attention',
        }),
      }),
    );
  });
});

// runGuichetAlertesCheck's 4 cron sub-checks all share prisma.guichetTransaction
// .findMany with different `select` shapes — route by the shape rather than by
// call order so the test survives internal reordering.
function routeFindMany(responses: {
  orgIds?: Array<{ organizationId: string }>;
  yesterdays?: Array<{ statut: string }>;
  recentCancellations?: unknown[];
  gapsRecent?: Array<{ createdAt: Date }>;
  ruptureRows?: Array<{ numeroSequence: number }>;
  montantRows?: unknown[];
}) {
  prismaMock.guichetTransaction.findMany.mockImplementation((args: unknown) => {
    const a = args as { select?: Record<string, unknown>; orderBy?: Record<string, unknown> };
    const sel = a.select ?? {};
    if ('organizationId' in sel) return Promise.resolve(responses.orgIds ?? []) as never;
    if ('typeRecetteId' in sel)
      return Promise.resolve(responses.recentCancellations ?? []) as never;
    if ('numeroSequence' in sel) return Promise.resolve(responses.ruptureRows ?? []) as never;
    if ('remiseAppliquee' in sel) return Promise.resolve(responses.montantRows ?? []) as never;
    if (a.orderBy && 'createdAt' in a.orderBy)
      return Promise.resolve(responses.gapsRecent ?? []) as never;
    return Promise.resolve(responses.yesterdays ?? []) as never;
  });
}

describe('runGuichetAlertesCheck (cron sweep — § 6.3 taux/série, § 6.4, § 6.5, § 6.6)', () => {
  it('no organizations with Guichet activity → zero counts, no further queries', async () => {
    routeFindMany({ orgIds: [] });
    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });
    expect(result).toEqual({ organizationsChecked: 0, alertsFired: 0 });
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('one org, no data anywhere → alertsFired 0', async () => {
    routeFindMany({ orgIds: [{ organizationId: ORG }] });
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });
    expect(result).toEqual({ organizationsChecked: 1, alertsFired: 0 });
    expect(prismaMock.guichetAlerte.create).not.toHaveBeenCalled();
  });

  it('rupture de séquence (§ 6.5) → critique alert, alertsFired=1', async () => {
    routeFindMany({
      orgIds: [{ organizationId: ORG }],
      ruptureRows: [{ numeroSequence: 1 }, { numeroSequence: 3 }],
    });
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });

    expect(result.alertsFired).toBe(1);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'rupture_sequence', severite: 'critique' }),
      }),
    );
  });

  it('montant hors grille (§ 6.6) → critique alert, alertsFired=1', async () => {
    routeFindMany({
      orgIds: [{ organizationId: ORG }],
      montantRows: [
        { id: 'gt-1', montant: 900, remiseAppliquee: null, typeRecette: { tarif: 1000 } },
      ],
    });
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });

    expect(result.alertsFired).toBe(1);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'montant_hors_grille', severite: 'critique' }),
      }),
    );
  });

  it("taux d'annulation quotidien > 15% (évalué contre hier) → attention", async () => {
    const yesterdays = [
      ...Array.from({ length: 8 }, () => ({ statut: 'emise' })),
      { statut: 'annulee' },
      { statut: 'annulee' },
    ];
    routeFindMany({ orgIds: [{ organizationId: ORG }], yesterdays });
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });

    expect(result.alertsFired).toBe(1);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          typeAlerte: 'annulations_suspectes',
          severite: 'attention',
        }),
      }),
    );
  });

  it('même type de recette annulé 3 jours consécutifs → critique', async () => {
    routeFindMany({
      orgIds: [{ organizationId: ORG }],
      recentCancellations: [
        {
          typeRecetteId: 'tr-1',
          createdAt: new Date(2026, 0, 10, 9, 0),
          typeRecette: { libelle: 'Consultation' },
        },
        {
          typeRecetteId: 'tr-1',
          createdAt: new Date(2026, 0, 11, 9, 0),
          typeRecette: { libelle: 'Consultation' },
        },
        {
          typeRecetteId: 'tr-1',
          createdAt: new Date(2026, 0, 12, 9, 0),
          typeRecette: { libelle: 'Consultation' },
        },
      ],
    });
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });

    expect(result.alertsFired).toBe(1);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          typeAlerte: 'annulations_suspectes',
          severite: 'critique',
        }),
      }),
    );
  });

  it('inactivité totale sur un jour ouvert déclaré (§ 6.4) → critique', async () => {
    routeFindMany({ orgIds: [{ organizationId: ORG }] });
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: [],
    } as never);
    prismaMock.guichetTransaction.count.mockResolvedValue(0);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

    // now = Tuesday 2026-01-13 — yesterday (Monday) is a declared open day.
    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 9, 0),
    });

    expect(result.alertsFired).toBe(1);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'inactivite', severite: 'critique' }),
      }),
    );
  });

  it('inactivité anormale — écart au rythme habituel dans les horaires déclarés (§ 6.4 attention)', async () => {
    routeFindMany({
      orgIds: [{ organizationId: ORG }],
      // avg gap = 60 min between these two.
      gapsRecent: [
        { createdAt: new Date(2026, 0, 5, 9, 0) },
        { createdAt: new Date(2026, 0, 5, 10, 0) },
      ],
    });
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      // Yesterday (Monday) is declared closed — skips the "total inactivity" branch
      // so only the "attention" pace sub-rule is exercised in isolation.
      joursFermeture: ['lundi'],
    } as never);
    prismaMock.guichetTransaction.findFirst.mockResolvedValue(null);
    mockOrgFound();
    mockAlerteCreate();
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'oe-1' } as never);

    // now = Tuesday 2026-01-13, 15:00 — within declared hours; no transaction
    // recorded today yet, so sinceLastMs is ~15h, far above avgGap*2 (2h).
    const result = await runGuichetAlertesCheck({
      prisma: prismaMock,
      now: new Date(2026, 0, 13, 15, 0),
    });

    expect(result.alertsFired).toBe(1);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'inactivite', severite: 'attention' }),
      }),
    );
  });
});
