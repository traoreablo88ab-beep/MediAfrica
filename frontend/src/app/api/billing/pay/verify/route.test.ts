import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

vi.mock('@/lib/server/subscriptions/chariow-singleton', () => ({
  getChariowClient: vi.fn(),
  ChariowUnconfiguredError: class ChariowUnconfiguredError extends Error {},
}));

vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcilePayment: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import {
  getChariowClient,
  ChariowUnconfiguredError,
} from '@/lib/server/subscriptions/chariow-singleton';
import { reconcilePayment } from '@/lib/server/subscriptions/reconcile';
import { POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const getChariowClientMock = vi.mocked(getChariowClient);
const reconcilePaymentMock = vi.mocked(reconcilePayment);

const authedCtx = {
  user: { sub: 'user-1', email: 'owner@test.local' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makePost(): NextRequest {
  return new NextRequest('http://test/api/billing/pay/verify', { method: 'POST' });
}

function subscriptionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    status: 'PAST_DUE',
    currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function paymentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pay-1',
    subscriptionId: 'sub-1',
    providerSaleId: 'sal-1',
    status: 'PENDING',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  getChariowClientMock.mockReturnValue({
    createCheckout: vi.fn(),
    getSale: vi.fn(),
    webhookProvider: {} as never,
  });
  reconcilePaymentMock.mockResolvedValue({ outcome: 'pending' });
});

describe('POST /api/billing/pay/verify', () => {
  it('401/403 when requireOrgMember bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
  });

  it('404 SUBSCRIPTION_NOT_FOUND when the clinic has none', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(res.status).toBe(404);
  });

  it('returns NONE when no SubscriptionPayment exists yet', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(await res.json()).toEqual({ status: 'NONE' });
    expect(reconcilePaymentMock).not.toHaveBeenCalled();
  });

  it('reconciles a PENDING payment and returns the fresh status', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(paymentRow() as never);
    prismaMock.subscriptionPayment.findUniqueOrThrow.mockResolvedValue(
      paymentRow({ status: 'SUCCEEDED' }) as never,
    );
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue(
      subscriptionRow({ status: 'ACTIVE' }) as never,
    );

    const res = await POST(makePost());

    expect(reconcilePaymentMock).toHaveBeenCalledWith(
      prismaMock,
      expect.anything(),
      expect.objectContaining({ id: 'pay-1', providerSaleId: 'sal-1' }),
    );
    const body = await res.json();
    expect(body.status).toBe('SUCCEEDED');
    expect(body.subscription.status).toBe('ACTIVE');
  });

  it('does not reconcile an already-terminal payment', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(
      paymentRow({ status: 'SUCCEEDED' }) as never,
    );
    prismaMock.subscriptionPayment.findUniqueOrThrow.mockResolvedValue(
      paymentRow({ status: 'SUCCEEDED' }) as never,
    );
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue(subscriptionRow() as never);

    await POST(makePost());

    expect(reconcilePaymentMock).not.toHaveBeenCalled();
  });

  it('swallows ChariowUnconfiguredError and returns the last known state', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(paymentRow() as never);
    prismaMock.subscriptionPayment.findUniqueOrThrow.mockResolvedValue(paymentRow() as never);
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue(subscriptionRow() as never);
    getChariowClientMock.mockImplementationOnce(() => {
      throw new ChariowUnconfiguredError();
    });

    const res = await POST(makePost());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('PENDING');
  });
});
