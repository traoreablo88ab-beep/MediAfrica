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

function makeGet(url = 'http://test/api/guichet/alertes'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'al-1',
    typeAlerte: 'ecart_caisse',
    severite: 'critique',
    details: { ecart: -15000 },
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

describe('GET /api/guichet/alertes', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.guichetAlerte.findMany).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'MEMBER'] as const)(
    '%s cannot access the centre de notifications → 403 ORG_ROLE_INSUFFICIENT',
    async (role) => {
      mockRequireOrgMember.mockResolvedValueOnce(ctxWith(role));
      const res = await GET(makeGet());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
      expect(prismaMock.guichetAlerte.findMany).not.toHaveBeenCalled();
    },
  );

  it('empty → items:[], nextCursor:null', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
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
    prismaMock.guichetAlerte.findMany.mockResolvedValue(rows as never);
    const res = await GET(makeGet('http://test/api/guichet/alertes?limit=10'));
    const body = await res.json();
    expect(body.items.length).toBe(10);
    expect(body.nextCursor).not.toBeNull();
    const decoded = decodeCursor(body.nextCursor);
    expect(decoded?.id).toBe('al-9');
  });

  it('always scopes to the caller org (organizationId in where)', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet());
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.organizationId).toBe('org-1');
  });

  it('filters by ?severite (exact match)', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?severite=critique'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.severite).toBe('critique');
  });

  it('ignores an invalid ?severite value (no filter applied)', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?severite=bogus'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.severite).toBeUndefined();
  });

  it('filters by ?typeAlerte (exact match)', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?typeAlerte=rupture_sequence'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.typeAlerte).toBe('rupture_sequence');
  });

  it('?statut=non_vue → where vue:false', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?statut=non_vue'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.vue).toBe(false);
    expect(args?.where?.resolue).toBeUndefined();
  });

  it('?statut=vue → where vue:true, resolue:false', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?statut=vue'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.vue).toBe(true);
    expect(args?.where?.resolue).toBe(false);
  });

  it('?statut=resolue → where resolue:true', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?statut=resolue'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.where?.resolue).toBe(true);
  });

  it('cursor → next page where (createdAt < cursor.createdAt) OR (=, id < cursor.id)', async () => {
    const cursor = encodeCursor({ createdAt: new Date('2026-01-05T00:00:00Z'), id: 'al-9' });
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(
      makeGet(`http://test/api/guichet/alertes?limit=10&cursor=${encodeURIComponent(cursor)}`),
    );
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    const or = args?.where?.OR as Array<Record<string, unknown>> | undefined;
    expect(or).toBeDefined();
  });

  it('orderBy [createdAt desc, id desc] + take limit+1', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/alertes?limit=20'));
    const args = prismaMock.guichetAlerte.findMany.mock.calls[0]?.[0];
    expect(args?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args?.take).toBe(21);
  });

  it('serializes createdAt to ISO string in the response', async () => {
    prismaMock.guichetAlerte.findMany.mockResolvedValue([row()] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.items[0].createdAt).toBe('2026-01-12T09:00:00.000Z');
  });
});
