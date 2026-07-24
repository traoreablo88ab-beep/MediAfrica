import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

const authedCtx = {
  user: { sub: 'user-1', email: 'owner@test.local' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/billing/subscription', { method: 'GET' });
}

function subscriptionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    status: 'ACTIVE',
    trialEndsAt: null,
    currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    plan: {
      id: 'plan-1',
      name: 'Standard',
      priceAmount: 15000,
      currency: 'XOF',
      billingIntervalDays: 30,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
});

describe('GET /api/billing/subscription', () => {
  it('returns 401 when requireOrgMember bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the caller organization', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findMany.mockResolvedValue([] as never);
    await GET(makeGet());
    const args = prismaMock.subscription.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ organizationId: 'org-1' });
  });

  it('404 SUBSCRIPTION_NOT_FOUND when the clinic has none', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  it('returns subscription, plan, and payment history', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        amount: 15000,
        currency: 'XOF',
        status: 'PAID',
        paymentUrl: null,
        paidAt: new Date('2026-07-01T00:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription).toMatchObject({ id: 'sub-1', status: 'ACTIVE' });
    expect(body.plan).toMatchObject({ id: 'plan-1', name: 'Standard', priceAmount: 15000 });
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({ id: 'order-1', status: 'PAID' });
  });
});
