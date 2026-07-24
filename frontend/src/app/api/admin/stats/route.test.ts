import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/stats', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.organization.count.mockResolvedValue(3);
  prismaMock.organizationMember.count.mockResolvedValue(8);
  prismaMock.consultation.count.mockResolvedValue(42);
  prismaMock.subscription.findMany.mockResolvedValue([
    { plan: { priceAmount: 15000, currency: 'XOF' } },
    { plan: { priceAmount: 25000, currency: 'XOF' } },
  ] as never);
  prismaMock.organization.findMany.mockResolvedValue([
    {
      id: 'org-1',
      name: 'Centre A',
      slug: 'centre-a',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    },
  ] as never);
  prismaMock.order.findMany.mockResolvedValue([
    { amount: 15000, paidAt: new Date('2026-07-05T00:00:00Z') },
  ] as never);
});

describe('GET /api/admin/stats', () => {
  it('returns 403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.organization.count).not.toHaveBeenCalled();
  });

  it('sums ACTIVE subscription plan prices into MRR', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mrr).toBe(40000);
    expect(body.mrrCurrency).toBe('XOF');
  });

  it('only counts ACTIVE subscriptions for MRR', async () => {
    await GET(makeGet());
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ status: 'ACTIVE' });
  });

  it('returns organization/staff/consultation counts', async () => {
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.organizationCount).toBe(3);
    expect(body.staffCount).toBe(8);
    expect(body.consultationsThisMonth).toBe(42);
  });

  it('builds a 6-entry revenue trend bucketed by paid month', async () => {
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.revenueTrend).toHaveLength(6);
    const total = body.revenueTrend.reduce((sum: number, t: { total: number }) => sum + t.total, 0);
    expect(total).toBe(15000);
  });

  it('returns the 5 most recent organizations', async () => {
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.newOrganizations).toEqual([
      { id: 'org-1', name: 'Centre A', slug: 'centre-a', createdAt: '2026-07-01T00:00:00.000Z' },
    ]);
  });

  it('mrr is 0 with default currency when there are no active subscriptions', async () => {
    prismaMock.subscription.findMany.mockResolvedValueOnce([] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.mrr).toBe(0);
    expect(body.mrrCurrency).toBe('XOF');
  });
});
