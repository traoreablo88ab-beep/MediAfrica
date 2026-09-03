import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    user: { sub: 'user-1', email: 'staff@example.com' },
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
  return new NextRequest('http://test/api/guichet/types-recette/t-1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

function callPatch(body: unknown, id = 't-1', opts?: { csrf?: 'match' | 'missing' }) {
  return PATCH(makePatch(body, opts), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PATCH /api/guichet/types-recette/[id]', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await callPatch({ actif: false }, 't-1', { csrf: 'missing' });
    expect(res.status).toBe(403);
    expect(prismaMock.typeRecette.update).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callPatch({ actif: false });
    expect(res.status).toBe(401);
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await callPatch({ actif: false });
    expect(res.status).toBe(403);
    expect(prismaMock.typeRecette.update).not.toHaveBeenCalled();
  });

  it('empty body → 400 VALIDATION_FAILED', async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
    expect(prismaMock.typeRecette.update).not.toHaveBeenCalled();
  });

  it('not found in this org → 404', async () => {
    prismaMock.typeRecette.findFirst.mockResolvedValue(null);
    const res = await callPatch({ actif: false }, 't-missing');
    expect(res.status).toBe(404);
    expect(prismaMock.typeRecette.update).not.toHaveBeenCalled();
  });

  it('happy path: deactivate a tariff, 200', async () => {
    prismaMock.typeRecette.findFirst.mockResolvedValue({ id: 't-1' } as never);
    prismaMock.typeRecette.update.mockResolvedValue({
      id: 't-1',
      libelle: 'Consultation',
      tarif: 1000,
      actif: false,
    } as never);
    const res = await callPatch({ actif: false });
    expect(res.status).toBe(200);
    expect(prismaMock.typeRecette.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { actif: false },
    });
    const body = await res.json();
    expect(body.actif).toBe(false);
  });
});
