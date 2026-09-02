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
  return new NextRequest('http://test/api/registres/ressources/equipement', {
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
  prismaMock.equipmentLine.findMany.mockResolvedValue([]);
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

describe('GET /api/registres/ressources/equipement', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/ressources/equipement?echelon=csref'));
    expect(res.status).toBe(401);
  });

  it('missing echelon → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/registres/ressources/equipement'));
    expect(res.status).toBe(400);
  });

  it('csref, no rows → canonical items for that echelon returned with null fields', async () => {
    const res = await GET(
      makeGet('http://test/api/registres/ressources/equipement?month=2026-01&echelon=csref'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const telephone = body.lines.find((l: { itemKey: string }) => l.itemKey === 'telephone');
    expect(telephone.category).toBe('communication');
    expect(telephone.nombreFonctionnel).toBeNull();
    // csref-only item present
    expect(body.lines.some((l: { itemKey: string }) => l.itemKey === 'autreVehicule')).toBe(true);
    // cscom-only item absent
    expect(body.lines.some((l: { itemKey: string }) => l.itemKey === 'refrigerateur1')).toBe(false);
  });

  it('cscom, no rows → includes réfrigérateurs/congélateurs, excludes CSRéf-only items', async () => {
    const res = await GET(
      makeGet('http://test/api/registres/ressources/equipement?month=2026-01&echelon=cscom'),
    );
    const body = await res.json();
    expect(body.lines.some((l: { itemKey: string }) => l.itemKey === 'refrigerateur1')).toBe(true);
    expect(body.lines.some((l: { itemKey: string }) => l.itemKey === 'autreVehicule')).toBe(false);
  });

  it('existing rows are merged into the canonical list by itemKey', async () => {
    prismaMock.equipmentLine.findMany.mockResolvedValue([
      {
        id: 'el-1',
        organizationId: 'org-1',
        month: '2026-01',
        category: 'refrigerateur',
        itemKey: 'refrigerateur1',
        label: 'Réfrigérateur n°1',
        tempMin8h: 2.5,
        tempMax8h: 7.1,
      } as never,
    ]);
    const res = await GET(
      makeGet('http://test/api/registres/ressources/equipement?month=2026-01&echelon=cscom'),
    );
    const body = await res.json();
    const line = body.lines.find((l: { itemKey: string }) => l.itemKey === 'refrigerateur1');
    expect(line.tempMin8h).toBe(2.5);
    expect(line.tempMax8h).toBe(7.1);
  });
});

describe('PUT /api/registres/ressources/equipement', () => {
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

  it('itemKey not valid for the given echelon → 400 VALIDATION_FAILED; no transaction', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        echelon: 'csref',
        lines: [{ itemKey: 'refrigerateur1', nombreFonctionnel: 1 }],
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
        echelon: 'csref',
        lines: [{ itemKey: 'telephone', nombreFonctionnel: 1 }],
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
        lines: [{ itemKey: 'telephone', nombreFonctionnel: 1 }],
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

  it('happy path: upserts each line with its category/label resolved from the canonical list', async () => {
    const res = await PUT(
      makePut({
        month: '2026-01',
        echelon: 'cscom',
        lines: [
          { itemKey: 'telephone', nombreFonctionnel: 2, nombreEnPanne: 1, nombreRepare: 1 },
          { itemKey: 'refrigerateur1', tempMin8h: 2.5, tempMax8h: 7.1, nbAlarmeBasse8h: 0 },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.equipmentLine.upsert).toHaveBeenCalledTimes(2);

    const firstArg = prismaMock.equipmentLine.upsert.mock.calls[0]?.[0];
    expect(firstArg?.where).toEqual({
      organizationId_month_itemKey: {
        organizationId: 'org-1',
        month: '2026-01',
        itemKey: 'telephone',
      },
    });
    expect(firstArg?.create).toMatchObject({
      organizationId: 'org-1',
      month: '2026-01',
      category: 'communication',
      itemKey: 'telephone',
      label: 'Téléphone',
      updatedById: 'user-1',
      nombreFonctionnel: 2,
    });

    const secondArg = prismaMock.equipmentLine.upsert.mock.calls[1]?.[0];
    expect(secondArg?.create).toMatchObject({
      itemKey: 'refrigerateur1',
      category: 'refrigerateur',
      tempMin8h: 2.5,
      tempMax8h: 7.1,
    });

    const body = await res.json();
    expect(body.echelon).toBe('cscom');
    expect(Array.isArray(body.lines)).toBe(true);
  });
});
