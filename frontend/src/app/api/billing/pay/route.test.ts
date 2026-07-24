// Mirrors src/app/api/orders/route.test.ts's mocking bootstrap, adapted for
// billing/pay: requireOrgMember instead of requireAuth, no client-supplied
// idempotency key (server-derives `sub:{subscriptionId}:{currentPeriodEnd}`),
// no amount/organizationId in the request body — everything comes from the
// caller's own subscription.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/payments/provider-singleton', () => ({
  getProvider: vi.fn(),
  breaker: { execute: vi.fn() },
  PaymentProviderUnconfiguredError: class PaymentProviderUnconfiguredError extends Error {
    constructor() {
      super('Payment provider not configured');
      this.name = 'PaymentProviderUnconfiguredError';
    }
  },
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import {
  getProvider,
  breaker,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import { POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockGetProvider = vi.mocked(getProvider);
const mockExecute = vi.mocked(breaker.execute);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'owner@test.local' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makePost(): NextRequest {
  return new NextRequest('http://test/api/billing/pay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function subscriptionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    status: 'ACTIVE',
    currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    plan: { id: 'plan-1', priceAmount: 15000, currency: 'XOF' },
    ...overrides,
  };
}

function seededOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    userId: 'user-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    amount: 15000,
    currency: 'XOF',
    status: 'PENDING',
    provider: 'bictorys',
    idempotencyKey: 'sub:sub-1:2026-08-01T00:00:00.000Z',
    paymentUrl: null,
    providerChargeId: null,
    expiresAt: new Date('2026-08-02T00:00:00Z'),
    customerEmail: 'owner@test.local',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BICTORYS_API_URL = 'https://api.test.bictorys.local';
  process.env.BICTORYS_API_KEY = 'test-key';
  process.env.PUBLIC_URL = 'http://localhost:3000';

  mockRequireOrgMember.mockResolvedValue(ctxWith('OWNER'));
  mockVerifyCsrf.mockReturnValue(null);
  mockGetProvider.mockReturnValue({
    name: 'bictorys',
    charge: vi.fn(async () => ({
      providerChargeId: 'charge-1',
      paymentUrl: 'https://checkout.test/bictorys/pay/sub-1',
      status: 'PENDING' as const,
    })),
  } as never);
  mockExecute.mockImplementation(async (fn) => fn());
});

describe('POST /api/billing/pay', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('401 when requireOrgMember bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('404 SUBSCRIPTION_NOT_FOUND when the clinic has no subscription', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  it('creates a PENDING order and returns paymentUrl on the happy path', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue(seededOrder() as never);
    prismaMock.order.update.mockResolvedValue(
      seededOrder({ paymentUrl: 'https://checkout.test/bictorys/pay/sub-1' }) as never,
    );

    const res = await POST(makePost());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'order-1',
      paymentUrl: 'https://checkout.test/bictorys/pay/sub-1',
      status: 'PENDING',
    });
    const createArgs = prismaMock.order.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      userId: 'user-1',
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      amount: 15000,
      currency: 'XOF',
      idempotencyKey: 'sub:sub-1:2026-08-01T00:00:00.000Z',
    });
  });

  it('idempotency key is server-derived from subscriptionId + currentPeriodEnd — never client-supplied', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue(seededOrder() as never);
    prismaMock.order.update.mockResolvedValue(seededOrder() as never);

    await POST(makePost());

    expect(prismaMock.order.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'sub:sub-1:2026-08-01T00:00:00.000Z' },
    });
  });

  it('replays a prior PAID order without charging again', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(
      seededOrder({
        status: 'PAID',
        paymentUrl: 'https://checkout.test/bictorys/pay/paid',
      }) as never,
    );

    const res = await POST(makePost());

    expect(res.status).toBe(200);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('replays an in-flight PENDING order (paymentUrl null) as 503 PAYMENT_IN_FLIGHT', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(
      seededOrder({ status: 'PENDING', paymentUrl: null }) as never,
    );

    const res = await POST(makePost());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_IN_FLIGHT');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('retries a FAILED prior order by reusing the same row', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(seededOrder({ status: 'FAILED' }) as never);
    prismaMock.order.update.mockResolvedValue(
      seededOrder({ paymentUrl: 'https://checkout.test/bictorys/pay/retry' }) as never,
    );

    const res = await POST(makePost());

    expect(res.status).toBe(201);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('circuit open → 503 PAYMENT_PROVIDER_UNAVAILABLE, order marked FAILED', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue(seededOrder() as never);
    prismaMock.order.update.mockResolvedValue(seededOrder({ status: 'FAILED' }) as never);
    mockExecute.mockImplementationOnce(async () => {
      throw new CircuitOpenError('bictorys.charge', new Date(Date.now() + 60_000));
    });

    const res = await POST(makePost());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    const updateArgs = prismaMock.order.update.mock.calls[0]?.[0];
    expect(updateArgs?.data).toMatchObject({ status: 'FAILED' });
  });

  it('provider unconfigured → 503 PAYMENT_PROVIDER_UNCONFIGURED, no order created', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.order.findUnique.mockResolvedValue(null);
    mockGetProvider.mockImplementationOnce(() => {
      throw new PaymentProviderUnconfiguredError();
    });

    const res = await POST(makePost());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_PROVIDER_UNCONFIGURED');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});
