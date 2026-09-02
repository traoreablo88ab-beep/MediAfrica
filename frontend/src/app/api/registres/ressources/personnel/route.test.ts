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
  return new NextRequest('http://test/api/registres/ressources/personnel', {
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
  prismaMock.personnelLine.findMany.mockResolvedValue([]);
  prismaMock.personnelLine.deleteMany.mockResolvedValue({ count: 0 } as never);
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

describe('GET /api/registres/ressources/personnel', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/ressources/personnel?echelon=csref'));
    expect(res.status).toBe(401);
  });

  it('missing echelon → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/registres/ressources/personnel'));
    expect(res.status).toBe(400);
  });

  it('csref, no rows → full canonical category list returned with null fields', async () => {
    const res = await GET(
      makeGet('http://test/api/registres/ressources/personnel?month=2026-01&echelon=csref'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lines.length).toBeGreaterThan(30);
    const pharmacien = body.lines.find((l: { itemKey: string }) => l.itemKey === 'pharmacien');
    expect(pharmacien.qualification).toBe('Pharmacien');
    expect(pharmacien.effectifOfficiel).toBeNull();
  });

  it('csref, existing rows are merged into the canonical list by itemKey', async () => {
    prismaMock.personnelLine.findMany.mockResolvedValue([
      {
        id: 'pl-1',
        organizationId: 'org-1',
        month: '2026-01',
        echelon: 'csref',
        itemKey: 'pharmacien',
        qualification: 'Pharmacien',
        effectifOfficiel: 2,
      } as never,
    ]);
    const res = await GET(
      makeGet('http://test/api/registres/ressources/personnel?month=2026-01&echelon=csref'),
    );
    const body = await res.json();
    const line = body.lines.find((l: { itemKey: string }) => l.itemKey === 'pharmacien');
    expect(line.effectifOfficiel).toBe(2);
  });

  it('cscom, no rows → empty free-form list', async () => {
    const res = await GET(
      makeGet('http://test/api/registres/ressources/personnel?month=2026-01&echelon=cscom'),
    );
    const body = await res.json();
    expect(body.lines).toEqual([]);
  });

  it('cscom → returns whatever free-form rows exist, no canonical merge', async () => {
    prismaMock.personnelLine.findMany.mockResolvedValue([
      {
        id: 'pl-2',
        organizationId: 'org-1',
        month: '2026-01',
        echelon: 'cscom',
        itemKey: 'agent-1',
        qualification: 'Infirmier',
        sexe: 'H',
      } as never,
    ]);
    const res = await GET(
      makeGet('http://test/api/registres/ressources/personnel?month=2026-01&echelon=cscom'),
    );
    const body = await res.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].itemKey).toBe('agent-1');
    expect(body.lines[0].sexe).toBe('H');
  });
});

describe('PUT /api/registres/ressources/personnel', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await PUT(
      makePut({ month: '2026-01', echelon: 'csref', lines: [] }, { csrf: 'missing' }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PUT(makePut({ month: '2026-01', echelon: 'csref', lines: [] }));
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('invalid month format → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ month: '2026/01', echelon: 'csref', lines: [] }));
    expect(res.status).toBe(400);
  });

  it('csref with unknown itemKey → 400 VALIDATION_FAILED; no transaction', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        echelon: 'csref',
        lines: [{ itemKey: 'not-a-real-category', qualification: 'X' }],
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('cscom accepts free-form itemKey', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        echelon: 'cscom',
        lines: [{ itemKey: 'agent-generated-id-1', qualification: 'Infirmier', sexe: 'H' }],
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.personnelLine.upsert).toHaveBeenCalledTimes(1);
  });

  it('month closed → 409 REGISTER_CLOSED; no transaction', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await PUT(
      makePut({
        month: '2026-01',
        echelon: 'csref',
        lines: [{ itemKey: 'pharmacien', qualification: 'Pharmacien', effectifOfficiel: 1 }],
      }),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('checks closure against the shared "ressources" registerType', async () => {
    await PUT(
      makePut({
        month: '2025-12',
        echelon: 'csref',
        lines: [{ itemKey: 'pharmacien', qualification: 'Pharmacien', effectifOfficiel: 1 }],
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

  it('cscom happy path: deletes rows absent from the payload', async () => {
    await PUT(
      makePut({
        month: '2026-01',
        echelon: 'cscom',
        lines: [{ itemKey: 'agent-1', qualification: 'Infirmier' }],
      }),
    );
    expect(prismaMock.personnelLine.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        month: '2026-01',
        echelon: 'cscom',
        itemKey: { notIn: ['agent-1'] },
      },
    });
  });

  it('csref happy path: upserts each line, returns the full category list', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        echelon: 'csref',
        lines: [{ itemKey: 'pharmacien', qualification: 'Pharmacien', effectifOfficiel: 2 }],
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.personnelLine.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prismaMock.personnelLine.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where).toEqual({
      organizationId_month_itemKey: {
        organizationId: 'org-1',
        month: '2026-01',
        itemKey: 'pharmacien',
      },
    });
    expect(upsertArg?.create).toMatchObject({
      organizationId: 'org-1',
      month: '2026-01',
      echelon: 'csref',
      itemKey: 'pharmacien',
      qualification: 'Pharmacien',
      updatedById: 'user-1',
      effectifOfficiel: 2,
    });
    // CSRéf is a fixed canonical list, deleteMany is not called for it
    expect(prismaMock.personnelLine.deleteMany).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.echelon).toBe('csref');
    expect(Array.isArray(body.lines)).toBe(true);
  });
});
