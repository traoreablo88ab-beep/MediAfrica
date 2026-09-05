import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET, POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER', sub = 'user-1') {
  return {
    user: { sub, email: 'gerant@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(url = 'http://test/api/depot/ventes'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/depot/ventes', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function produitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    organizationId: 'org-1',
    nom: 'Paracétamol',
    prixUnitaire: 200,
    stockActuel: 50,
    seuilAlerteStock: 10,
    actif: true,
    ...overrides,
  };
}

function venteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    organizationId: 'org-1',
    numeroSequence: 1,
    patientNom: 'Awa Traoré',
    patientId: null,
    montantTotal: 600,
    modePaiement: 'especes',
    gerantId: 'user-1',
    statut: 'emise',
    createdAt: new Date('2026-01-12T09:00:00Z'),
    annulationMotif: null,
    annulationParId: null,
    annulationAt: null,
    gerant: { name: 'Awa Gérante', email: 'gerant@example.com' },
    lignes: [
      {
        id: 'l-1',
        produitId: 'prod-1',
        quantite: 3,
        prixUnitaireApplique: 200,
        sousTotal: 600,
        produit: { nom: 'Paracétamol' },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('MEMBER'));
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.depotVente.findFirst.mockResolvedValue(null); // no prior row → next seq = 1
  prismaMock.medicamentProduit.findMany.mockResolvedValue([produitRow()] as never);
  prismaMock.medicamentProduit.findUniqueOrThrow.mockResolvedValue({ stockActuel: 50 } as never);
  prismaMock.depotVente.create.mockResolvedValue({ id: 'v-1' } as never);
  prismaMock.depotVente.findUniqueOrThrow.mockResolvedValue(venteRow() as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/depot/ventes', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(
      makePost(
        {
          patientNom: 'Awa Traoré',
          modePaiement: 'especes',
          lignes: [{ produitId: 'prod-1', quantite: 3 }],
        },
        { csrf: 'missing' },
      ),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.depotVente.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 3 }],
      }),
    );
    expect(res.status).toBe(401);
  });

  it('empty lignes array → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ patientNom: 'Awa Traoré', modePaiement: 'especes', lignes: [] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('invalid modePaiement → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'cheque',
        lignes: [{ produitId: 'prod-1', quantite: 3 }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('patientId not found in this org → 404 PATIENT_NOT_FOUND', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        patientId: 'patient-1',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 3 }],
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PATIENT_NOT_FOUND');
  });

  it('unknown produitId → 400 PRODUIT_INVALID', async () => {
    prismaMock.medicamentProduit.findMany.mockResolvedValue([]);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-x', quantite: 3 }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PRODUIT_INVALID');
    expect(prismaMock.depotVente.create).not.toHaveBeenCalled();
  });

  it('inactive (désactivé) produit → 400 PRODUIT_INVALID', async () => {
    prismaMock.medicamentProduit.findMany.mockResolvedValue([
      produitRow({ actif: false }),
    ] as never);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 3 }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PRODUIT_INVALID');
  });

  it('stock insuffisant → 400 STOCK_INSUFFISANT, does not create the sale', async () => {
    prismaMock.medicamentProduit.findUniqueOrThrow.mockResolvedValue({ stockActuel: 1 } as never);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 3 }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('STOCK_INSUFFISANT');
  });

  it('happy path: montantTotal/sousTotal are server-derived from the catalogue price, never the client', async () => {
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 3, prixUnitaireApplique: 1 }],
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.depotVente.create.mock.calls[0]?.[0] as {
      data: { numeroSequence: number; montantTotal: number };
    };
    expect(createArgs.data.numeroSequence).toBe(1);
    expect(createArgs.data.montantTotal).toBe(600); // 3 × 200, not the client's fake 1
    const ligneArgs = prismaMock.depotVenteLigne.create.mock.calls[0]?.[0] as {
      data: { prixUnitaireApplique: number; sousTotal: number };
    };
    expect(ligneArgs.data.prixUnitaireApplique).toBe(200);
    expect(ligneArgs.data.sousTotal).toBe(600);
    const body = await res.json();
    expect(body.montantTotal).toBe(600);
  });

  it('multi-line cart: each line decrements its own product via applyStockMovement', async () => {
    prismaMock.medicamentProduit.findMany.mockResolvedValue([
      produitRow({ id: 'prod-1', prixUnitaire: 200 }),
      produitRow({ id: 'prod-2', nom: 'Amoxicilline', prixUnitaire: 500 }),
    ] as never);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [
          { produitId: 'prod-1', quantite: 2 },
          { produitId: 'prod-2', quantite: 1 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.depotVenteLigne.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledTimes(2);
    const createArgs = prismaMock.depotVente.create.mock.calls[0]?.[0] as {
      data: { montantTotal: number };
    };
    expect(createArgs.data.montantTotal).toBe(2 * 200 + 1 * 500);
  });

  it('numeroSequence derives from max+1, not a row count', async () => {
    prismaMock.depotVente.findFirst.mockResolvedValue({ numeroSequence: 41 } as never);
    await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 1 }],
      }),
    );
    const createArgs = prismaMock.depotVente.create.mock.calls[0]?.[0] as {
      data: { numeroSequence: number };
    };
    expect(createArgs.data.numeroSequence).toBe(42);
  });

  it('retries the transaction on a numeroSequence P2002 collision', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['organizationId', 'numeroSequence'] },
    });
    prismaMock.depotVente.create.mockRejectedValueOnce(collision).mockResolvedValueOnce({
      id: 'v-1',
    } as never);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        modePaiement: 'especes',
        lignes: [{ produitId: 'prod-1', quantite: 1 }],
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.depotVente.create).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/depot/ventes', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('a MEMBER only sees their own sales for the day', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([]);
    await GET(makeGet());
    expect(prismaMock.depotVente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', gerantId: 'user-1' }),
      }),
    );
  });

  it('an ADMIN sees every gérant for the day (no gerantId filter)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN'));
    prismaMock.depotVente.findMany.mockResolvedValue([]);
    await GET(makeGet());
    const args = prismaMock.depotVente.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.gerantId).toBeUndefined();
  });

  it('defaults to today, and honors an explicit ?date=', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/ventes?date=2026-01-05'));
    const args = prismaMock.depotVente.findMany.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    };
    expect(args.where.createdAt.gte).toEqual(new Date('2026-01-05T00:00:00'));
    expect(args.where.createdAt.lt).toEqual(new Date('2026-01-06T00:00:00'));
  });

  it('serializes lignes with produitNom from the include', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([venteRow()] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.ventes[0].lignes[0]).toEqual({
      id: 'l-1',
      produitId: 'prod-1',
      produitNom: 'Paracétamol',
      quantite: 3,
      prixUnitaireApplique: 200,
      sousTotal: 600,
    });
  });
});
