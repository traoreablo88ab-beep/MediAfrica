import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { PATCH } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'promoteur@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/depot/alertes/al-1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

function callPatch(body: unknown, id = 'al-1', opts?: { csrf?: 'match' | 'missing' }) {
  return PATCH(makePatch(body, opts), { params: Promise.resolve({ id }) });
}

function alerteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'al-1',
    typeAlerte: 'rupture_stock',
    severite: 'critique',
    details: null,
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
  prismaMock.depotAlerte.findFirst.mockResolvedValue({ id: 'al-1' } as never);
});

describe('PATCH /api/depot/alertes/[id]', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await callPatch({ vue: true }, 'al-1', { csrf: 'missing' });
    expect(res.status).toBe(403);
    expect(prismaMock.depotAlerte.update).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callPatch({ vue: true });
    expect(res.status).toBe(401);
  });

  it.each(['ADMIN', 'MEMBER'] as const)(
    '%s cannot manage alerts → 403 ORG_ROLE_INSUFFICIENT',
    async (role) => {
      mockRequireOrgMember.mockResolvedValueOnce(ctxWith(role));
      const res = await callPatch({ vue: true });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
      expect(prismaMock.depotAlerte.update).not.toHaveBeenCalled();
    },
  );

  it('empty body → 400 VALIDATION_FAILED', async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
    expect(prismaMock.depotAlerte.update).not.toHaveBeenCalled();
  });

  it('not found in this org → 404', async () => {
    prismaMock.depotAlerte.findFirst.mockResolvedValue(null);
    const res = await callPatch({ vue: true }, 'al-missing');
    expect(res.status).toBe(404);
    expect(prismaMock.depotAlerte.update).not.toHaveBeenCalled();
  });

  it('marks an alert as vue', async () => {
    prismaMock.depotAlerte.update.mockResolvedValue(alerteRow({ vue: true }) as never);
    const res = await callPatch({ vue: true });
    expect(res.status).toBe(200);
    const args = prismaMock.depotAlerte.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).toEqual({ vue: true });
  });

  it('marking resolue=true implicitly sets vue=true when vue is not sent', async () => {
    prismaMock.depotAlerte.update.mockResolvedValue(
      alerteRow({ vue: true, resolue: true }) as never,
    );
    await callPatch({ resolue: true });
    const args = prismaMock.depotAlerte.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).toEqual({ vue: true, resolue: true });
  });

  it('an explicit vue:false is respected even when resolving (no implicit override)', async () => {
    prismaMock.depotAlerte.update.mockResolvedValue(
      alerteRow({ vue: false, resolue: true }) as never,
    );
    await callPatch({ vue: false, resolue: true });
    const args = prismaMock.depotAlerte.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).toEqual({ vue: false, resolue: true });
  });

  it('attaches a resolutionNote', async () => {
    prismaMock.depotAlerte.update.mockResolvedValue(
      alerteRow({ resolutionNote: 'Réapprovisionnement commandé.' }) as never,
    );
    await callPatch({ resolutionNote: 'Réapprovisionnement commandé.' });
    const args = prismaMock.depotAlerte.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).toEqual({ resolutionNote: 'Réapprovisionnement commandé.' });
  });

  it('scopes the lookup to the caller org (cross-org id → 404, no leak)', async () => {
    prismaMock.depotAlerte.findFirst.mockResolvedValue(null);
    await callPatch({ vue: true }, 'al-other-org');
    const args = prismaMock.depotAlerte.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; organizationId: string };
    };
    expect(args.where).toEqual({ id: 'al-other-org', organizationId: 'org-1' });
  });

  it('serializes createdAt to ISO string in the response', async () => {
    prismaMock.depotAlerte.update.mockResolvedValue(alerteRow({ vue: true }) as never);
    const res = await callPatch({ vue: true });
    const body = await res.json();
    expect(body.createdAt).toBe('2026-01-12T09:00:00.000Z');
  });
});
