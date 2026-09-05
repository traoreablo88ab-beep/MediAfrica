import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { encodeCursor, decodeCursor } from '@/lib/server/notifications/cursor';
import { GET } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'promoteur@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(url = 'http://test/api/depot/alertes'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'al-1',
    typeAlerte: 'rupture_stock',
    severite: 'critique',
    details: { stockApres: 0 },
    vue: false,
    resolue: false,
    resolutionNote: null,
    createdAt: new Date('2026-01-12T09:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('OWNER'));
});

describe('GET /api/depot/alertes', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.depotAlerte.findMany).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'MEMBER'] as const)(
    '%s cannot access the centre de notifications → 403 ORG_ROLE_INSUFFICIENT',
    async (role) => {
      mockRequireOrgMember.mockResolvedValueOnce(ctxWith(role));
      const res = await GET(makeGet());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
      expect(prismaMock.depotAlerte.findMany).not.toHaveBeenCalled();
    },
  );

  it('empty → items:[], nextCursor:null', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], nextCursor: null });
  });

  it('pagination: 11 rows + ?limit=10 → items.length=10, nextCursor set', async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      row({
        id: `al-${i}`,
        createdAt: new Date(`2026-01-${String(11 - i).padStart(2, '0')}T00:00:00Z`),
      }),
    );
    prismaMock.depotAlerte.findMany.mockResolvedValue(rows as never);
    const res = await GET(makeGet('http://test/api/depot/alertes?limit=10'));
    const body = await res.json();
    expect(body.items.length).toBe(10);
    expect(body.nextCursor).not.toBeNull();
    const decoded = decodeCursor(body.nextCursor);
    expect(decoded?.id).toBe('al-9');
  });

  it('always scopes to the caller org (organizationId in where)', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet());
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.organizationId).toBe('org-1');
  });

  it('filters by ?severite (exact match)', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?severite=critique'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.severite).toBe('critique');
  });

  it('ignores an invalid ?severite value (no filter applied)', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?severite=bogus'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.severite).toBeUndefined();
  });

  it('filters by ?typeAlerte (exact match)', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?typeAlerte=ecart_caisse'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.typeAlerte).toBe('ecart_caisse');
  });

  it('rejects an unknown ?typeAlerte value (no filter applied — not one of the 2 Dépôt types)', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?typeAlerte=hors_horaires'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.typeAlerte).toBeUndefined();
  });

  it('?statut=non_vue → where vue:false', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?statut=non_vue'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.vue).toBe(false);
    expect(args?.where?.resolue).toBeUndefined();
  });

  it('?statut=vue → where vue:true, resolue:false', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?statut=vue'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.vue).toBe(true);
    expect(args?.where?.resolue).toBe(false);
  });

  it('?statut=resolue → where resolue:true', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?statut=resolue'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.resolue).toBe(true);
  });

  it('cursor → next page where (createdAt < cursor.createdAt) OR (=, id < cursor.id)', async () => {
    const cursor = encodeCursor({ createdAt: new Date('2026-01-05T00:00:00Z'), id: 'al-9' });
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(
      makeGet(`http://test/api/depot/alertes?limit=10&cursor=${encodeURIComponent(cursor)}`),
    );
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    const or = args?.where?.OR as Array<Record<string, unknown>> | undefined;
    expect(or).toBeDefined();
  });

  it('orderBy [createdAt desc, id desc] + take limit+1', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/depot/alertes?limit=20'));
    const args = prismaMock.depotAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args?.take).toBe(21);
  });

  it('serializes createdAt to ISO string in the response', async () => {
    prismaMock.depotAlerte.findMany.mockResolvedValue([row()] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.items[0].createdAt).toBe('2026-01-12T09:00:00.000Z');
  });
});
