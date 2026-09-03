import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET, POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/guichet/types-recette', { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/guichet/types-recette', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
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

describe('GET /api/guichet/types-recette', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('a MEMBER can read the grid (no role gate on GET)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    prismaMock.typeRecette.findMany.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
  });

  it('returns the org tariff grid, active and inactive', async () => {
    prismaMock.typeRecette.findMany.mockResolvedValue([
      { id: 't-1', libelle: 'Consultation générale', tarif: 1000, actif: true },
      { id: 't-2', libelle: 'Ancien tarif', tarif: 500, actif: false },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.types).toHaveLength(2);
    expect(body.types[0]).toEqual({
      id: 't-1',
      libelle: 'Consultation générale',
      tarif: 1000,
      actif: true,
    });
    expect(prismaMock.typeRecette.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });
});

describe('POST /api/guichet/types-recette', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ libelle: 'Consultation', tarif: 1000 }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.typeRecette.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ libelle: 'Consultation', tarif: 1000 }));
    expect(res.status).toBe(401);
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER (guichetier can read, not edit)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await POST(makePost({ libelle: 'Consultation', tarif: 1000 }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.typeRecette.create).not.toHaveBeenCalled();
  });

  it('OWNER can also create', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('OWNER'));
    prismaMock.typeRecette.create.mockResolvedValue({
      id: 't-1',
      libelle: 'Consultation',
      tarif: 1000,
      actif: true,
    } as never);
    const res = await POST(makePost({ libelle: 'Consultation', tarif: 1000 }));
    expect(res.status).toBe(201);
  });

  it('invalid body (negative tarif) → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ libelle: 'Consultation', tarif: -5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.typeRecette.create).not.toHaveBeenCalled();
  });

  it('happy path: ADMIN creates a tariff row, 201', async () => {
    prismaMock.typeRecette.create.mockResolvedValue({
      id: 't-1',
      libelle: 'Consultation générale',
      tarif: 1000,
      actif: true,
    } as never);
    const res = await POST(makePost({ libelle: 'Consultation générale', tarif: 1000 }));
    expect(res.status).toBe(201);
    expect(prismaMock.typeRecette.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', libelle: 'Consultation générale', tarif: 1000 },
    });
    const body = await res.json();
    expect(body).toEqual({ id: 't-1', libelle: 'Consultation générale', tarif: 1000, actif: true });
  });
});
