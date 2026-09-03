import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET, PATCH } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/settings/clinic', { method: 'GET' });
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/settings/clinic', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
});

describe('GET /api/settings/clinic', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('no settings row yet → default name, horaires undeclared', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body).toEqual({
      name: 'CSRéf Bamako V',
      heureOuverture: null,
      heureFermeture: null,
      joursFermeture: [],
    });
  });

  it('returns the declared name and horaires as-is', async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      name: 'CSCom Kalaban',
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: ['dimanche'],
    } as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body).toEqual({
      name: 'CSCom Kalaban',
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: ['dimanche'],
    });
  });
});

describe('PATCH /api/settings/clinic', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await PATCH(makePatch({ name: 'Test' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.clinicSettings.upsert).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makePatch({ name: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('a MEMBER cannot change clinic settings → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await PATCH(makePatch({ name: 'Test' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.clinicSettings.upsert).not.toHaveBeenCalled();
  });

  it('malformed heureOuverture → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ name: 'Test', heureOuverture: '8h00' }));
    expect(res.status).toBe(400);
    expect(prismaMock.clinicSettings.upsert).not.toHaveBeenCalled();
  });

  it('unknown weekday in joursFermeture → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ name: 'Test', joursFermeture: ['funday'] }));
    expect(res.status).toBe(400);
  });

  it('name-only update leaves horaires untouched (no keys sent to Prisma)', async () => {
    prismaMock.clinicSettings.upsert.mockResolvedValue({
      name: 'Nouveau nom',
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: [],
    } as never);
    await PATCH(makePatch({ name: 'Nouveau nom' }));
    const args = prismaMock.clinicSettings.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(args.update).toEqual({ name: 'Nouveau nom' });
  });

  it('déclare les horaires du centre (happy path)', async () => {
    prismaMock.clinicSettings.upsert.mockResolvedValue({
      name: 'CSRéf Bamako V',
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: ['dimanche'],
    } as never);
    const res = await PATCH(
      makePatch({
        name: 'CSRéf Bamako V',
        heureOuverture: '08:00',
        heureFermeture: '17:00',
        joursFermeture: ['dimanche'],
      }),
    );
    expect(res.status).toBe(200);
    const args = prismaMock.clinicSettings.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(args.update).toEqual({
      name: 'CSRéf Bamako V',
      heureOuverture: '08:00',
      heureFermeture: '17:00',
      joursFermeture: ['dimanche'],
    });
    const body = await res.json();
    expect(body.heureOuverture).toBe('08:00');
    expect(body.joursFermeture).toEqual(['dimanche']);
  });

  it('efface les horaires déclarées (heureOuverture/heureFermeture → null)', async () => {
    prismaMock.clinicSettings.upsert.mockResolvedValue({
      name: 'CSRéf Bamako V',
      heureOuverture: null,
      heureFermeture: null,
      joursFermeture: [],
    } as never);
    await PATCH(
      makePatch({
        name: 'CSRéf Bamako V',
        heureOuverture: null,
        heureFermeture: null,
        joursFermeture: [],
      }),
    );
    const args = prismaMock.clinicSettings.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(args.update).toEqual({
      name: 'CSRéf Bamako V',
      heureOuverture: null,
      heureFermeture: null,
      joursFermeture: [],
    });
  });
});
