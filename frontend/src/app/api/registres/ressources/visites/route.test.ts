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
  return new NextRequest('http://test/api/registres/ressources/visites', {
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
  prismaMock.visiteReunionLine.findMany.mockResolvedValue([]);
  prismaMock.visiteReunionLine.deleteMany.mockResolvedValue({ count: 0 } as never);
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

describe('GET /api/registres/ressources/visites', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/ressources/visites'));
    expect(res.status).toBe(401);
  });

  it('no rows for the month → empty list (no canonical seed rows)', async () => {
    const res = await GET(makeGet('http://test/api/registres/ressources/visites?month=2026-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(body.lines).toEqual([]);
  });

  it('defaults to the current month when no ?month= is given', async () => {
    await GET(makeGet('http://test/api/registres/ressources/visites'));
    const args = prismaMock.visiteReunionLine.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ organizationId: 'org-1', month: '2026-01' });
  });

  it('returns existing rows grouped by tableau', async () => {
    prismaMock.visiteReunionLine.findMany.mockResolvedValue([
      {
        id: 'vr-1',
        organizationId: 'org-1',
        month: '2026-01',
        tableau: 'supervision_district',
        itemKey: 'row-1',
        type: 'Supervision intégrée',
        datePrevue: '2026-01-05',
      } as never,
    ]);
    const res = await GET(makeGet('http://test/api/registres/ressources/visites?month=2026-01'));
    const body = await res.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].tableau).toBe('supervision_district');
    expect(body.lines[0].type).toBe('Supervision intégrée');
  });
});

describe('PUT /api/registres/ressources/visites', () => {
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
  });

  it('unknown tableau → 400 VALIDATION_FAILED; no transaction', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        lines: [{ tableau: 'not-a-real-tableau', itemKey: 'row-1' }],
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('month closed → 409 REGISTER_CLOSED; no transaction', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await PUT(
      makePut({
        month: '2026-01',
        lines: [{ tableau: 'supervision_district', itemKey: 'row-1' }],
      }),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('checks closure against the shared "ressources" registerType', async () => {
    await PUT(
      makePut({
        month: '2025-12',
        lines: [{ tableau: 'supervision_district', itemKey: 'row-1' }],
      }),
    );
    const args = prismaMock.registerClosure.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_registerType_month: {
        organizationId: 'org-1',
        registerType: 'ressources',
        month: '2025-12',
      },
    });
  });

  it('happy path: upserts each line, deletes rows absent from the payload', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        lines: [
          {
            tableau: 'supervision_district',
            itemKey: 'row-1',
            type: 'Supervision intégrée',
            datePrevue: '2026-01-05',
            dateRealisation: '2026-01-06',
          },
          { tableau: 'conseil_administration', itemKey: 'row-2', numeroCompteRendu: 'CR-01' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.visiteReunionLine.upsert).toHaveBeenCalledTimes(2);

    const firstArg = prismaMock.visiteReunionLine.upsert.mock.calls[0]?.[0];
    expect(firstArg?.where).toEqual({
      organizationId_month_itemKey: { organizationId: 'org-1', month: '2026-01', itemKey: 'row-1' },
    });
    expect(firstArg?.create).toMatchObject({
      organizationId: 'org-1',
      month: '2026-01',
      tableau: 'supervision_district',
      itemKey: 'row-1',
      updatedById: 'user-1',
      type: 'Supervision intégrée',
    });

    expect(prismaMock.visiteReunionLine.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        month: '2026-01',
        itemKey: { notIn: ['row-1', 'row-2'] },
      },
    });

    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(Array.isArray(body.lines)).toBe(true);
  });

  it('empty lines payload deletes all rows for the month (no notIn filter)', async () => {
    await PUT(makePut({ month: '2026-01', lines: [] }));
    expect(prismaMock.visiteReunionLine.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', month: '2026-01', itemKey: undefined },
    });
  });
});
