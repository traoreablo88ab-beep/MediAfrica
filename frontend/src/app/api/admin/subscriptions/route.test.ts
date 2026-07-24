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

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function subRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    status: 'PAST_DUE',
    trialEndsAt: null,
    currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
    organization: { id: 'org-1', name: 'Centre A' },
    plan: { id: 'plan-1', name: 'Standard', priceAmount: 15000, currency: 'XOF' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/subscriptions', () => {
  it('returns 403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/subscriptions'));
    expect(res.status).toBe(403);
  });

  it('lists subscriptions with org + plan info', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([subRow()] as never);
    const res = await GET(makeGet('http://test/api/admin/subscriptions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      id: 'sub-1',
      organizationId: 'org-1',
      organizationName: 'Centre A',
      status: 'PAST_DUE',
    });
  });

  it('?status= filters by subscription status', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/admin/subscriptions?status=PAST_DUE'));
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ status: 'PAST_DUE' });
  });

  it('?organizationId= filters to a single clinic', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/admin/subscriptions?organizationId=org-1'));
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ organizationId: 'org-1' });
  });
});
