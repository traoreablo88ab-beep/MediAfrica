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

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/depot/produits', { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/depot/produits', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/depot/produits', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('a MEMBER can read the catalogue (no role gate on GET)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    prismaMock.medicamentProduit.findMany.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
  });

  it('returns the org catalogue, active and inactive', async () => {
    prismaMock.medicamentProduit.findMany.mockResolvedValue([
      {
        id: 'p-1',
        nom: 'Paracétamol',
        prixUnitaire: 200,
        stockActuel: 50,
        seuilAlerteStock: 10,
        actif: true,
      },
      {
        id: 'p-2',
        nom: 'Ancien produit',
        prixUnitaire: 100,
        stockActuel: 0,
        seuilAlerteStock: null,
        actif: false,
      },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.produits).toHaveLength(2);
    expect(body.produits[0]).toEqual({
      id: 'p-1',
      nom: 'Paracétamol',
      prixUnitaire: 200,
      stockActuel: 50,
      seuilAlerteStock: 10,
      actif: true,
    });
    expect(prismaMock.medicamentProduit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });
});

describe('POST /api/depot/produits', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(
      makePost({ nom: 'Paracétamol', prixUnitaire: 200 }, { csrf: 'missing' }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.medicamentProduit.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ nom: 'Paracétamol', prixUnitaire: 200 }));
    expect(res.status).toBe(401);
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER (gérant can read, not manage the catalogue)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await POST(makePost({ nom: 'Paracétamol', prixUnitaire: 200 }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.medicamentProduit.create).not.toHaveBeenCalled();
  });

  it('OWNER can also create', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('OWNER'));
    prismaMock.medicamentProduit.create.mockResolvedValue({
      id: 'p-1',
      nom: 'Paracétamol',
      prixUnitaire: 200,
      stockActuel: 0,
      seuilAlerteStock: null,
      actif: true,
    } as never);
    const res = await POST(makePost({ nom: 'Paracétamol', prixUnitaire: 200 }));
    expect(res.status).toBe(201);
  });

  it('invalid body (negative prixUnitaire) → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ nom: 'Paracétamol', prixUnitaire: -5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.medicamentProduit.create).not.toHaveBeenCalled();
  });

  it('happy path: stockActuel always starts at 0, regardless of client input', async () => {
    prismaMock.medicamentProduit.create.mockResolvedValue({
      id: 'p-1',
      nom: 'Paracétamol',
      prixUnitaire: 200,
      stockActuel: 0,
      seuilAlerteStock: 10,
      actif: true,
    } as never);
    const res = await POST(
      makePost({
        nom: 'Paracétamol',
        prixUnitaire: 200,
        seuilAlerteStock: 10,
        stockActuel: 999, // a naive/malicious client trying to seed stock directly
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.medicamentProduit.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        nom: 'Paracétamol',
        prixUnitaire: 200,
        stockActuel: 0,
        seuilAlerteStock: 10,
      },
    });
    const body = await res.json();
    expect(body.stockActuel).toBe(0);
  });
});
