import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdminOrgAccess: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdminOrgAccess } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdminOrgAccess = vi.mocked(requireAdminOrgAccess);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(id: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/organizations/${id}`, { method: 'GET' }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

function orgDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'org-1',
    slug: 'centre-a',
    name: 'Centre A',
    owner: { id: 'u-owner', email: 'owner@test.local', name: 'Owner' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    members: [{ role: 'OWNER', user: { id: 'u-owner', email: 'owner@test.local', name: 'Owner' } }],
    subscription: {
      id: 'sub-1',
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
      plan: { id: 'plan-1', name: 'Standard', priceAmount: 15000, currency: 'XOF' },
    },
    _count: { patients: 4 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminOrgAccess.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/organizations/[id]', () => {
  it('returns 403 when requireAdminOrgAccess bails', async () => {
    mockRequireAdminOrgAccess.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const { req, ctx } = makeGet('org-1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('resolves access scoped to the requested org id', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(orgDetail() as never);
    const { req, ctx } = makeGet('org-1');
    await GET(req, ctx);
    expect(mockRequireAdminOrgAccess).toHaveBeenCalledWith('org-1');
  });

  it('404 ORGANIZATION_NOT_FOUND when missing', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const { req, ctx } = makeGet('missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('returns full org detail: owner, members, subscription, patient count', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(orgDetail() as never);
    const { req, ctx } = makeGet('org-1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.owner).toEqual({ id: 'u-owner', email: 'owner@test.local', name: 'Owner' });
    expect(body.patientCount).toBe(4);
    expect(body.members).toEqual([
      { id: 'u-owner', email: 'owner@test.local', name: 'Owner', role: 'OWNER' },
    ]);
    expect(body.subscription).toMatchObject({ status: 'ACTIVE', plan: { name: 'Standard' } });
  });

  it('subscription is null when the org has none', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(
      orgDetail({ subscription: null }) as never,
    );
    const { req, ctx } = makeGet('org-1');
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(body.subscription).toBeNull();
  });
});
