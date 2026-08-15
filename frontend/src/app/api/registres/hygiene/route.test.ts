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
  return new NextRequest('http://test/api/registres/hygiene', {
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

describe('GET /api/registres/hygiene', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/hygiene'));
    expect(res.status).toBe(401);
  });

  it('no record for the month → all counters null', async () => {
    prismaMock.hygieneRapport.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('http://test/api/registres/hygiene?month=2026-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(body.nbNouveauxPuitsRealises).toBeNull();
    expect(body.nbBoitesSecuriteIncinerees).toBeNull();
    expect(body.nbSeancesSensibilisationPlanifiees).toBeNull();
  });

  it('defaults to the current month when no ?month= is given', async () => {
    prismaMock.hygieneRapport.findUnique.mockResolvedValue(null);
    await GET(makeGet('http://test/api/registres/hygiene'));
    const args = prismaMock.hygieneRapport.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_month: { organizationId: 'org-1', month: '2026-01' },
    });
  });

  it('existing record → returns its counters', async () => {
    prismaMock.hygieneRapport.findUnique.mockResolvedValue({
      id: 'hr-1',
      organizationId: 'org-1',
      month: '2026-01',
      nbNouveauxPuitsRealises: 4,
      nbBoitesSecuriteIncinerees: 12,
    } as never);
    const res = await GET(makeGet('http://test/api/registres/hygiene?month=2026-01'));
    const body = await res.json();
    expect(body.nbNouveauxPuitsRealises).toBe(4);
    expect(body.nbBoitesSecuriteIncinerees).toBe(12);
    // fields absent on the mocked record fall back to null, not undefined
    expect(body.nbSeancesSensibilisationPlanifiees).toBeNull();
  });
});

describe('PUT /api/registres/hygiene', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await PUT(makePut({ month: '2026-01' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.hygieneRapport.upsert).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PUT(makePut({ month: '2026-01' }));
    expect(res.status).toBe(401);
    expect(prismaMock.hygieneRapport.upsert).not.toHaveBeenCalled();
  });

  it('invalid month format → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ month: '2026/01' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.hygieneRapport.upsert).not.toHaveBeenCalled();
  });

  it('negative or non-integer counter → 400 VALIDATION_FAILED', async () => {
    const res = await PUT(makePut({ month: '2026-01', nbNouveauxPuitsRealises: -1 }));
    expect(res.status).toBe(400);
    expect(prismaMock.hygieneRapport.upsert).not.toHaveBeenCalled();
  });

  it('month closed → 409 REGISTER_CLOSED; no upsert', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await PUT(makePut({ month: '2026-01', nbNouveauxPuitsRealises: 4 }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.hygieneRapport.upsert).not.toHaveBeenCalled();
  });

  it('checks closure for the given month, not the current one (timezone-safe)', async () => {
    prismaMock.hygieneRapport.upsert.mockResolvedValue({
      month: '2025-12',
    } as never);
    await PUT(makePut({ month: '2025-12', nbNouveauxPuitsRealises: 4 }));
    const args = prismaMock.registerClosure.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_registerType_month: {
        organizationId: 'org-1',
        registerType: 'hygiene',
        month: '2025-12',
      },
    });
  });

  it('happy path: upserts only the provided fields, returns full shape', async () => {
    prismaMock.hygieneRapport.upsert.mockResolvedValue({
      id: 'hr-1',
      organizationId: 'org-1',
      month: '2026-01',
      nbNouveauxPuitsRealises: 4,
      nbBoitesSecuriteIncinerees: 12,
    } as never);

    const res = await PUT(
      makePut({ month: '2026-01', nbNouveauxPuitsRealises: 4, nbBoitesSecuriteIncinerees: 12 }),
    );

    expect(res.status).toBe(200);
    const upsertArg = prismaMock.hygieneRapport.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where).toEqual({
      organizationId_month: { organizationId: 'org-1', month: '2026-01' },
    });
    expect(upsertArg?.create).toMatchObject({
      organizationId: 'org-1',
      month: '2026-01',
      updatedById: 'user-1',
      nbNouveauxPuitsRealises: 4,
      nbBoitesSecuriteIncinerees: 12,
    });
    expect(upsertArg?.update).toMatchObject({
      updatedById: 'user-1',
      nbNouveauxPuitsRealises: 4,
      nbBoitesSecuriteIncinerees: 12,
    });
    // fields not provided in the body are absent from the upsert data (partial update)
    expect(upsertArg?.update).not.toHaveProperty('nbSeancesSensibilisationPlanifiees');

    const body = await res.json();
    expect(body.month).toBe('2026-01');
    expect(body.nbNouveauxPuitsRealises).toBe(4);
    expect(body.nbBoitesSecuriteIncinerees).toBe(12);
    expect(body.nbSeancesSensibilisationPlanifiees).toBeNull();
  });
});
