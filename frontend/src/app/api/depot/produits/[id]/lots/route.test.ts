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
    user: { sub: 'user-1', email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(id = 'p-1'): NextRequest {
  return new NextRequest(`http://test/api/depot/produits/${id}/lots`, { method: 'GET' });
}

function callGet(id = 'p-1') {
  return GET(makeGet(id), { params: Promise.resolve({ id }) });
}

function lotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lot-1',
    numeroLot: 'LOT-A',
    datePeremption: new Date('2027-01-01T00:00:00Z'),
    quantiteInitiale: 20,
    quantiteRestante: 12,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
  prismaMock.medicamentProduit.findFirst.mockResolvedValue({ id: 'p-1' } as never);
  prismaMock.medicamentLot.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/depot/produits/[id]/lots', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it('a MEMBER can read the lot list (no role gate)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await callGet();
    expect(res.status).toBe(200);
  });

  it('not found in this org → 404', async () => {
    prismaMock.medicamentProduit.findFirst.mockResolvedValue(null);
    const res = await callGet('p-missing');
    expect(res.status).toBe(404);
  });

  it('queries lots for the given product + org, FEFO-ordered', async () => {
    await callGet();
    expect(prismaMock.medicamentLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', produitId: 'p-1' },
        orderBy: [{ datePeremption: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
    );
  });

  it('an expired lot (datePeremption in the past) → statut expire', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([
      lotRow({ datePeremption: new Date('2026-05-01T00:00:00Z') }),
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.lots[0].statut).toBe('expire');
  });

  it('a lot within 30 days → statut proche_peremption', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([
      lotRow({ datePeremption: new Date('2026-06-10T00:00:00Z') }),
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.lots[0].statut).toBe('proche_peremption');
  });

  it('a lot more than 30 days out → statut ok', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([
      lotRow({ datePeremption: new Date('2026-12-01T00:00:00Z') }),
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.lots[0].statut).toBe('ok');
  });

  it('an undated (legacy) lot → statut ok, datePeremption null', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([
      lotRow({ datePeremption: null }),
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.lots[0].statut).toBe('ok');
    expect(body.lots[0].datePeremption).toBeNull();
  });

  it('serializes quantiteInitiale/quantiteRestante and an ISO date', async () => {
    prismaMock.medicamentLot.findMany.mockResolvedValue([lotRow()] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.lots[0]).toEqual({
      id: 'lot-1',
      numeroLot: 'LOT-A',
      datePeremption: '2027-01-01',
      quantiteInitiale: 20,
      quantiteRestante: 12,
      statut: 'ok',
    });
  });
});
