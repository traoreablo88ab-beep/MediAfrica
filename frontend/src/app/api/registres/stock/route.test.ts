import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET, PUT } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePut(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/registres/stock', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
  prismaMock.stockLine.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve([]);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/registres/stock', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/stock'));
    expect(res.status).toBe(401);
  });

  it('no rows for the month → all ~111 canonical items returned with null fields', async () => {
    prismaMock.stockLine.findMany.mockResolvedValue([]);
    const res = await GET(makeGet('http://test/api/registres/stock?month=2026-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body.lines.length).toBeGreaterThan(100);
    const bcg = body.lines.find((l: { itemKey: string }) => l.itemKey === 'bcg');
    expect(bcg.category).toBe('vaccins');
    expect(bcg.quantiteDebut).toBeNull();
    expect(bcg.numeroLot).toBeNull();
  });

  it('defaults to the current month when no ?month= is given', async () => {
    await GET(makeGet('http://test/api/registres/stock'));
    const args = prismaMock.stockLine.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ organizationId: 'org-1', month: '2026-01' });
  });

  it('existing rows are merged into the canonical list by itemKey', async () => {
    prismaMock.stockLine.findMany.mockResolvedValue([
      {
        id: 'sl-1',
        organizationId: 'org-1',
        month: '2026-01',
        itemKey: 'paracetamol_500mg',
        category: 'panier',
        quantiteDebut: 40,
        quantiteRecue: 10,
        consommation: 20,
      } as never,
    ]);
    const res = await GET(makeGet('http://test/api/registres/stock?month=2026-01'));
    const body = await res.json();
    const line = body.lines.find((l: { itemKey: string }) => l.itemKey === 'paracetamol_500mg');
    expect(line.quantiteDebut).toBe(40);
    expect(line.quantiteRecue).toBe(10);
    expect(line.consommation).toBe(20);
    expect(line.quantiteFin).toBeNull();
  });
});

describe('PUT /api/registres/stock', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await PUT(makePut({ month: '2026-01', lines: [] }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PUT(makePut({ month: '2026-01', lines: [] }));
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('invalid month format → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ month: '2026/01', lines: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('unknown itemKey → 400 VALIDATION_FAILED; no transaction', async () => {
    const res = await PUT(
      makePut({ month: '2026-01', lines: [{ itemKey: 'not-a-real-item', quantiteDebut: 5 }] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('negative counter → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(
      makePut({ month: '2026-01', lines: [{ itemKey: 'bcg', quantiteDebut: -1 }] }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('month closed → 409 REGISTER_CLOSED; no transaction', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await PUT(
      makePut({ month: '2026-01', lines: [{ itemKey: 'bcg', quantiteDebut: 5 }] }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('checks closure for the given month, not the current one (timezone-safe)', async () => {
    await PUT(makePut({ month: '2025-12', lines: [{ itemKey: 'bcg', quantiteDebut: 5 }] }));
    const args = prismaMock.registerClosure.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_registerType_month: {
        organizationId: 'org-1',
        registerType: 'stock',
        month: '2025-12',
      },
    });
  });

  it('happy path: upserts each line with its category resolved from the canonical list', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        lines: [
          { itemKey: 'paracetamol_500mg', quantiteDebut: 40, quantiteRecue: 10 },
          { itemKey: 'bcg', quantiteDebut: 12, numeroLot: 'LOT-42' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.stockLine.upsert).toHaveBeenCalledTimes(2);

    const firstArg = prismaMock.stockLine.upsert.mock.calls[0]?.[0];
    expect(firstArg?.where).toEqual({
      organizationId_month_itemKey: {
        organizationId: 'org-1',
        month: '2026-01',
        itemKey: 'paracetamol_500mg',
      },
    });
    expect(firstArg?.create).toMatchObject({
      organizationId: 'org-1',
      month: '2026-01',
      itemKey: 'paracetamol_500mg',
      category: 'panier',
      updatedById: 'user-1',
      quantiteDebut: 40,
      quantiteRecue: 10,
    });

    const secondArg = prismaMock.stockLine.upsert.mock.calls[1]?.[0];
    expect(secondArg?.create).toMatchObject({
      itemKey: 'bcg',
      category: 'vaccins',
      quantiteDebut: 12,
      numeroLot: 'LOT-42',
    });

    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(Array.isArray(body.lines)).toBe(true);
  });
});
