import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'admin@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(url = 'http://test/api/depot/rapports'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function venteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    montantTotal: 600,
    gerantId: 'gerant-1',
    gerant: { name: 'Awa Gérante', email: 'gerant@example.com' },
    lignes: [
      {
        produitId: 'prod-1',
        quantite: 3,
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
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
  prismaMock.depotVente.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/depot/rapports', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('a MEMBER cannot access the reports → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.depotVente.findMany).not.toHaveBeenCalled();
  });

  it('an OWNER can also access the reports', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('OWNER'));
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
  });

  it('defaults to the 1st of the current month through today when no range is given', async () => {
    await GET(makeGet());
    const args = prismaMock.depotVente.findMany.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    };
    expect(args.where.createdAt.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(args.where.createdAt.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('honors an explicit ?from and ?to (end date is inclusive)', async () => {
    await GET(makeGet('http://test/api/depot/rapports?from=2025-12-01&to=2025-12-31'));
    const args = prismaMock.depotVente.findMany.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    };
    expect(args.where.createdAt.gte).toEqual(new Date('2025-12-01T00:00:00'));
    expect(args.where.createdAt.lt).toEqual(new Date('2026-01-01T00:00:00'));
  });

  it('only counts "emise" ventes — statut is part of the where clause', async () => {
    await GET(makeGet());
    const args = prismaMock.depotVente.findMany.mock.calls[0]?.[0] as {
      where: { statut: string };
    };
    expect(args.where.statut).toBe('emise');
  });

  it('empty period → zeroed totals, empty breakdowns', async () => {
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body).toMatchObject({ totalVentes: 0, totalMontant: 0, parProduit: [], parGerant: [] });
  });

  it('aggregates par produit and par gérant across multiple ventes', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([
      venteRow(),
      venteRow({
        id: 'v-2',
        montantTotal: 1000,
        gerantId: 'gerant-1',
        lignes: [
          {
            produitId: 'prod-1',
            quantite: 2,
            sousTotal: 400,
            produit: { nom: 'Paracétamol' },
          },
          {
            produitId: 'prod-2',
            quantite: 1,
            sousTotal: 600,
            produit: { nom: 'Amoxicilline' },
          },
        ],
      }),
      venteRow({
        id: 'v-3',
        montantTotal: 300,
        gerantId: 'gerant-2',
        gerant: { name: null, email: 'autre@example.com' },
        lignes: [
          { produitId: 'prod-2', quantite: 1, sousTotal: 300, produit: { nom: 'Amoxicilline' } },
        ],
      }),
    ] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(body.totalVentes).toBe(3);
    expect(body.totalMontant).toBe(600 + 1000 + 300);

    const paracetamol = body.parProduit.find(
      (p: { produitId: string }) => p.produitId === 'prod-1',
    );
    expect(paracetamol).toEqual({
      produitId: 'prod-1',
      produitNom: 'Paracétamol',
      quantite: 3 + 2,
      montant: 600 + 400,
    });
    const amoxicilline = body.parProduit.find(
      (p: { produitId: string }) => p.produitId === 'prod-2',
    );
    expect(amoxicilline).toEqual({
      produitId: 'prod-2',
      produitNom: 'Amoxicilline',
      quantite: 1 + 1,
      montant: 600 + 300,
    });

    const gerant1 = body.parGerant.find((g: { gerantId: string }) => g.gerantId === 'gerant-1');
    expect(gerant1).toEqual({
      gerantId: 'gerant-1',
      gerantName: 'Awa Gérante',
      montant: 600 + 1000,
      nombreVentes: 2,
    });
    const gerant2 = body.parGerant.find((g: { gerantId: string }) => g.gerantId === 'gerant-2');
    expect(gerant2).toEqual({
      gerantId: 'gerant-2',
      gerantName: 'autre@example.com', // no name → falls back to email
      montant: 300,
      nombreVentes: 1,
    });
  });

  it('sorts both breakdowns descending by montant', async () => {
    prismaMock.depotVente.findMany.mockResolvedValue([
      venteRow({
        id: 'v-small',
        montantTotal: 100,
        gerantId: 'gerant-small',
        lignes: [{ produitId: 'prod-small', quantite: 1, sousTotal: 100, produit: { nom: 'B' } }],
      }),
      venteRow({
        id: 'v-big',
        montantTotal: 5000,
        gerantId: 'gerant-big',
        lignes: [{ produitId: 'prod-big', quantite: 1, sousTotal: 5000, produit: { nom: 'A' } }],
      }),
    ] as never);

    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.parProduit[0].produitId).toBe('prod-big');
    expect(body.parGerant[0].gerantId).toBe('gerant-big');
  });

  it('always scopes to the caller org (organizationId in where)', async () => {
    await GET(makeGet());
    const args = prismaMock.depotVente.findMany.mock.calls[0]?.[0] as {
      where: { organizationId: string };
    };
    expect(args.where.organizationId).toBe('org-1');
  });
});
