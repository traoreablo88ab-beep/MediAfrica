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
  return new NextRequest('http://test/api/registres/ressources', {
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/registres/ressources', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/ressources'));
    expect(res.status).toBe(401);
  });

  it('no record for the month → all fields null', async () => {
    prismaMock.ressourcesRapport.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('http://test/api/registres/ressources?month=2026-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(body.csrefAppuiConseilCercle).toBeNull();
    expect(body.energieEdm).toBeNull();
    expect(body.medIndicateurMaintien).toBeNull();
    expect(body.compteResultat).toBeNull();
  });

  it('defaults to the current month when no ?month= is given', async () => {
    prismaMock.ressourcesRapport.findUnique.mockResolvedValue(null);
    await GET(makeGet('http://test/api/registres/ressources'));
    const args = prismaMock.ressourcesRapport.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_month: { organizationId: 'org-1', month: '2026-01' },
    });
  });

  it('existing record → returns its fields', async () => {
    prismaMock.ressourcesRapport.findUnique.mockResolvedValue({
      id: 'rr-1',
      organizationId: 'org-1',
      month: '2026-01',
      csrefAppuiConseilCercle: true,
      energieSolaire: false,
      compteResultat: -1500,
    } as never);
    const res = await GET(makeGet('http://test/api/registres/ressources?month=2026-01'));
    const body = await res.json();
    expect(body.csrefAppuiConseilCercle).toBe(true);
    expect(body.energieSolaire).toBe(false);
    expect(body.compteResultat).toBe(-1500);
    expect(body.csrefAutreAppui).toBeNull();
  });
});

describe('PUT /api/registres/ressources', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await PUT(makePut({ month: '2026-01' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.ressourcesRapport.upsert).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PUT(makePut({ month: '2026-01' }));
    expect(res.status).toBe(401);
    expect(prismaMock.ressourcesRapport.upsert).not.toHaveBeenCalled();
  });

  it('invalid month format → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ month: '2026/01' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.ressourcesRapport.upsert).not.toHaveBeenCalled();
  });

  it('non-integer counter → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ month: '2026-01', cscomNbJoursFermeture: 1.5 }));
    expect(res.status).toBe(400);
    expect(prismaMock.ressourcesRapport.upsert).not.toHaveBeenCalled();
  });

  it('negative financial variance is allowed (not rejected)', async () => {
    prismaMock.ressourcesRapport.upsert.mockResolvedValue({
      month: '2026-01',
      compteVariationStock: -300,
    } as never);
    const res = await PUT(makePut({ month: '2026-01', compteVariationStock: -300 }));
    expect(res.status).toBe(200);
    expect(prismaMock.ressourcesRapport.upsert).toHaveBeenCalled();
  });

  it('month closed → 409 REGISTER_CLOSED; no upsert', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await PUT(makePut({ month: '2026-01', energieEdm: true }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.ressourcesRapport.upsert).not.toHaveBeenCalled();
  });

  it('checks closure against the shared "ressources" registerType', async () => {
    prismaMock.ressourcesRapport.upsert.mockResolvedValue({ month: '2025-12' } as never);
    await PUT(makePut({ month: '2025-12', energieEdm: true }));
    const args = prismaMock.registerClosure.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_registerType_month: {
        organizationId: 'org-1',
        registerType: 'ressources',
        month: '2025-12',
      },
    });
  });

  it('happy path: upserts only the provided fields, returns full shape', async () => {
    prismaMock.ressourcesRapport.upsert.mockResolvedValue({
      id: 'rr-1',
      organizationId: 'org-1',
      month: '2026-01',
      csrefAppuiConseilCercle: true,
      cscomNbJoursFermeture: 2,
    } as never);

    const res = await PUT(
      makePut({ month: '2026-01', csrefAppuiConseilCercle: true, cscomNbJoursFermeture: 2 }),
    );

    expect(res.status).toBe(200);
    const upsertArg = prismaMock.ressourcesRapport.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where).toEqual({
      organizationId_month: { organizationId: 'org-1', month: '2026-01' },
    });
    expect(upsertArg?.create).toMatchObject({
      organizationId: 'org-1',
      month: '2026-01',
      updatedById: 'user-1',
      csrefAppuiConseilCercle: true,
      cscomNbJoursFermeture: 2,
    });
    expect(upsertArg?.update).not.toHaveProperty('energieEdm');

    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(body.csrefAppuiConseilCercle).toBe(true);
    expect(body.cscomNbJoursFermeture).toBe(2);
    expect(body.energieEdm).toBeNull();
  });
});
