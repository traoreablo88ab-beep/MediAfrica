import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { encodeCursor } from '@/lib/server/notifications/cursor';
import { GET, POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(url = 'http://test/api/depot/produits/p-1/mouvements'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/depot/produits/p-1/mouvements', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function callPost(body: unknown, id = 'p-1', opts?: { csrf?: 'match' | 'missing' }) {
  return POST(makePost(body, opts), { params: Promise.resolve({ id }) });
}

function callGet(url?: string, id = 'p-1') {
  return GET(makeGet(url), { params: Promise.resolve({ id }) });
}

function mouvementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    type: 'entree',
    quantite: 10,
    motif: 'Réception livraison PPM',
    venteId: null,
    stockAvant: 0,
    stockApres: 10,
    auteur: { name: 'Awa Gérante', email: 'gerante@example.com' },
    createdAt: new Date('2026-01-12T09:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
  prismaMock.medicamentProduit.findFirst.mockResolvedValue({ id: 'p-1' } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/depot/produits/[id]/mouvements', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await callPost({ type: 'entree', quantite: 10, motif: 'Livraison' }, 'p-1', {
      csrf: 'missing',
    });
    expect(res.status).toBe(403);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callPost({ type: 'entree', quantite: 10, motif: 'Livraison' });
    expect(res.status).toBe(401);
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await callPost({ type: 'entree', quantite: 10, motif: 'Livraison' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
  });

  it('missing motif → 400 VALIDATION_FAILED', async () => {
    const res = await callPost({ type: 'entree', quantite: 10 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('invalid type → 400 VALIDATION_FAILED', async () => {
    const res = await callPost({ type: 'vente', quantite: 10, motif: 'Livraison' });
    expect(res.status).toBe(400);
  });

  it('not found in this org → 404', async () => {
    prismaMock.medicamentProduit.findFirst.mockResolvedValue(null);
    const res = await callPost({ type: 'entree', quantite: 10, motif: 'Livraison' }, 'p-missing');
    expect(res.status).toBe(404);
  });

  it('stock insuffisant on a sortie → 400 STOCK_INSUFFISANT', async () => {
    // applyStockMovement reads stockActuel via findUniqueOrThrow, then
    // throws StockInsuffisantError once the sortie would go negative.
    prismaMock.medicamentProduit.findUniqueOrThrow.mockResolvedValue({ stockActuel: 2 } as never);
    const res = await callPost({ type: 'sortie', quantite: 10, motif: 'Inventaire' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('STOCK_INSUFFISANT');
  });

  it('happy path: entrée increments stock via applyStockMovement, 201', async () => {
    prismaMock.medicamentProduit.findUniqueOrThrow
      .mockResolvedValueOnce({ stockActuel: 5 } as never)
      .mockResolvedValueOnce({ id: 'p-1', nom: 'Paracétamol', stockActuel: 15 } as never);
    const res = await callPost({ type: 'entree', quantite: 10, motif: 'Réception PPM' });
    expect(res.status).toBe(201);
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { stockActuel: 15 },
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        produitId: 'p-1',
        type: 'entree',
        quantite: 10,
        motif: 'Réception PPM',
        venteId: null,
        stockAvant: 5,
        stockApres: 15,
        auteurId: 'user-1',
      },
    });
    const body = await res.json();
    expect(body.stockActuel).toBe(15);
  });

  it('an entrée never checks rupture_stock, even when the result is still under the seuil', async () => {
    prismaMock.medicamentProduit.findUniqueOrThrow
      .mockResolvedValueOnce({ stockActuel: 5 } as never)
      .mockResolvedValueOnce({
        id: 'p-1',
        nom: 'Paracétamol',
        stockActuel: 15,
        seuilAlerteStock: 100,
      } as never);
    await callPost({ type: 'entree', quantite: 10, motif: 'Réception PPM' });
    expect(prismaMock.depotAlerte.create).not.toHaveBeenCalled();
  });

  it('a sortie that drains the product to 0 fires a rupture_stock alert (§ 6.1)', async () => {
    prismaMock.medicamentProduit.findUniqueOrThrow
      .mockResolvedValueOnce({ stockActuel: 10 } as never)
      .mockResolvedValueOnce({
        id: 'p-1',
        nom: 'Paracétamol',
        stockActuel: 0,
        seuilAlerteStock: 5,
      } as never);
    prismaMock.organization.findUnique.mockResolvedValue({
      owner: { id: 'owner-1', email: 'owner@example.com' },
    } as never);
    prismaMock.depotAlerte.create.mockResolvedValue({ id: 'al-1' } as never);

    const res = await callPost({ type: 'sortie', quantite: 10, motif: 'Casse' });
    expect(res.status).toBe(201);
    expect(prismaMock.depotAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'rupture_stock', severite: 'critique' }),
      }),
    );
  });

  it('a sortie that leaves stock above the seuil fires no alert', async () => {
    prismaMock.medicamentProduit.findUniqueOrThrow
      .mockResolvedValueOnce({ stockActuel: 50 } as never)
      .mockResolvedValueOnce({
        id: 'p-1',
        nom: 'Paracétamol',
        stockActuel: 40,
        seuilAlerteStock: 5,
      } as never);
    const res = await callPost({ type: 'sortie', quantite: 10, motif: 'Casse' });
    expect(res.status).toBe(201);
    expect(prismaMock.depotAlerte.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/depot/produits/[id]/mouvements', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it('a MEMBER can read the movement history (no role gate on GET)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([]);
    const res = await callGet();
    expect(res.status).toBe(200);
  });

  it('not found in this org → 404', async () => {
    prismaMock.medicamentProduit.findFirst.mockResolvedValue(null);
    const res = await callGet(undefined, 'p-missing');
    expect(res.status).toBe(404);
  });

  it('empty → items:[], nextCursor:null', async () => {
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([]);
    const res = await callGet();
    const body = await res.json();
    expect(body).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows including auteurName (falling back to email) and ISO createdAt', async () => {
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([
      mouvementRow(),
      mouvementRow({ id: 'mv-2', auteur: { name: null, email: 'sans-nom@example.com' } }),
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.items[0]).toEqual({
      id: 'mv-1',
      type: 'entree',
      quantite: 10,
      motif: 'Réception livraison PPM',
      venteId: null,
      stockAvant: 0,
      stockApres: 10,
      auteurName: 'Awa Gérante',
      createdAt: '2026-01-12T09:00:00.000Z',
    });
    expect(body.items[1].auteurName).toBe('sans-nom@example.com');
  });

  it('pagination: 21 rows + ?limit=20 → items.length=20, nextCursor set', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      mouvementRow({
        id: `mv-${i}`,
        createdAt: new Date(`2026-01-${String(21 - i).padStart(2, '0')}T00:00:00Z`),
      }),
    );
    prismaMock.depotMouvementStock.findMany.mockResolvedValue(rows as never);
    const res = await callGet('http://test/api/depot/produits/p-1/mouvements?limit=20');
    const body = await res.json();
    expect(body.items.length).toBe(20);
    expect(body.nextCursor).not.toBeNull();
  });

  it('scopes to the given product + org, ordered newest first', async () => {
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([]);
    await callGet();
    const args = prismaMock.depotMouvementStock.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual(
      expect.objectContaining({ organizationId: 'org-1', produitId: 'p-1' }),
    );
    expect(args?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('a cursor narrows the where clause', async () => {
    const cursor = encodeCursor({ createdAt: new Date('2026-01-05T00:00:00Z'), id: 'mv-9' });
    prismaMock.depotMouvementStock.findMany.mockResolvedValue([]);
    await callGet(
      `http://test/api/depot/produits/p-1/mouvements?cursor=${encodeURIComponent(cursor)}`,
    );
    const args = prismaMock.depotMouvementStock.findMany.mock.calls[0]?.[0];
    expect(args?.where?.OR).toBeDefined();
  });
});
