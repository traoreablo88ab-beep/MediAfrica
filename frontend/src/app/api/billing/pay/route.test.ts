// Mirrors src/app/api/orders/route.test.ts's mocking bootstrap, adapted for
// the Chariow-based billing/pay: requireOrgMember instead of requireAuth, no
// client-supplied amount — everything besides the billing-contact fields
// comes from the caller's own subscription + its plan's chariowProductId.
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

vi.mock('@/lib/server/subscriptions/chariow-singleton', () => ({
  getChariowClient: vi.fn(),
  ChariowUnconfiguredError: class ChariowUnconfiguredError extends Error {},
}));

vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcilePayment: vi.fn(),
  pendingExpireHours: () => 2,
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import {
  getChariowClient,
  ChariowUnconfiguredError,
} from '@/lib/server/subscriptions/chariow-singleton';
import { reconcilePayment } from '@/lib/server/subscriptions/reconcile';
import { POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const getChariowClientMock = vi.mocked(getChariowClient);
const reconcilePaymentMock = vi.mocked(reconcilePayment);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'owner@test.local' },
    orgMember: { organizationId: 'org-1', role },
  };
}

const CONTACT = {
  firstName: 'Awa',
  lastName: 'Diarra',
  phoneLocal: '73010538',
  phoneCountryIso2: 'ML',
};

function makePost(body: unknown = {}): NextRequest {
  return new NextRequest('http://test/api/billing/pay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function subscriptionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    status: 'PAST_DUE',
    currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    plan: {
      id: 'plan-1',
      priceAmount: 15000,
      currency: 'XOF',
      chariowProductId: 'prod_plan_1',
    },
    ...overrides,
  };
}

function chariowClientMock(overrides: Record<string, unknown> = {}) {
  return {
    createCheckout: vi.fn(async () => ({
      step: 'payment' as const,
      purchaseId: 'sal-1',
      status: 'pending',
      checkoutUrl: 'https://payment.chariow.com/sal-1',
    })),
    getSale: vi.fn(),
    webhookProvider: {} as never,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_URL = 'http://localhost:3000';

  mockRequireOrgMember.mockResolvedValue(ctxWith('OWNER'));
  mockVerifyCsrf.mockReturnValue(null);
  getChariowClientMock.mockReturnValue(chariowClientMock());
  prismaMock.subscriptionPayment.findFirst.mockResolvedValue(null); // no prior contact, no pending row, by default
});

describe('POST /api/billing/pay', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('bails when requireOrgMember bails', async () => {
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
  });

  it('400 VALIDATION_FAILED when only some contact fields are provided', async () => {
    const res = await POST(makePost({ firstName: 'Awa' }));
    expect(res.status).toBe(400);
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('404 SUBSCRIPTION_NOT_FOUND when the clinic has no subscription', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(res.status).toBe(404);
  });

  it('503 PLAN_NOT_CHARIOW_CONFIGURED when the plan has no chariowProductId', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      subscriptionRow({
        plan: { id: 'plan-1', priceAmount: 15000, currency: 'XOF', chariowProductId: null },
      }) as never,
    );
    const res = await POST(makePost());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PLAN_NOT_CHARIOW_CONFIGURED');
  });

  it('422 BILLING_CONTACT_REQUIRED on the first attempt with no body and no prior payment', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('BILLING_CONTACT_REQUIRED');
  });

  it('falls back to the last SubscriptionPayment contact when the body carries none', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst
      .mockResolvedValueOnce({
        customerFirstName: 'Awa',
        customerLastName: 'Diarra',
        customerPhoneLocal: '73010538',
        customerPhoneCountryIso2: 'ML',
      } as never) // contact lookup
      .mockResolvedValueOnce(null); // no PENDING row to supersede
    prismaMock.subscriptionPayment.create.mockResolvedValue({
      id: 'pay-1',
      checkoutUrl: 'https://payment.chariow.com/sal-1',
    } as never);

    const res = await POST(makePost());

    expect(res.status).toBe(201);
    const createArgs = prismaMock.subscriptionPayment.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      customerFirstName: 'Awa',
      customerLastName: 'Diarra',
    });
  });

  it('creates a PENDING SubscriptionPayment and returns the Chariow checkoutUrl on the happy path', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(null); // no PENDING row to supersede
    prismaMock.subscriptionPayment.create.mockResolvedValue({
      id: 'pay-1',
      checkoutUrl: 'https://payment.chariow.com/sal-1',
    } as never);

    const res = await POST(makePost(CONTACT));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'pay-1',
      paymentUrl: 'https://payment.chariow.com/sal-1',
      status: 'PENDING',
    });
    const createArgs = prismaMock.subscriptionPayment.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      subscriptionId: 'sub-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      providerSaleId: 'sal-1',
      status: 'PENDING',
      customerFirstName: 'Awa',
    });
  });

  it('supersedes an existing PENDING payment: reconciles it first, short-circuits on SUCCEEDED', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst
      .mockResolvedValueOnce({
        customerFirstName: 'Awa',
        customerLastName: 'Diarra',
        customerPhoneLocal: '73010538',
        customerPhoneCountryIso2: 'ML',
      } as never) // contact lookup fallback
      .mockResolvedValueOnce({
        id: 'pay-old',
        providerSaleId: 'sal-old',
        subscriptionId: 'sub-1',
      } as never); // PENDING to supersede
    reconcilePaymentMock.mockResolvedValueOnce({ outcome: 'succeeded' });

    const res = await POST(makePost());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 'pay-old', paymentUrl: null, status: 'SUCCEEDED' });
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('supersedes a still-pending prior attempt by expiring it and creating a fresh checkout', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst
      .mockResolvedValueOnce({
        customerFirstName: 'Awa',
        customerLastName: 'Diarra',
        customerPhoneLocal: '73010538',
        customerPhoneCountryIso2: 'ML',
      } as never)
      .mockResolvedValueOnce({
        id: 'pay-old',
        providerSaleId: 'sal-old',
        subscriptionId: 'sub-1',
      } as never);
    reconcilePaymentMock.mockResolvedValueOnce({ outcome: 'pending' });
    prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscriptionPayment.create.mockResolvedValue({
      id: 'pay-new',
      checkoutUrl: 'https://payment.chariow.com/sal-1',
    } as never);

    const res = await POST(makePost());

    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-old', status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    expect(res.status).toBe(201);
  });

  it('503 PAYMENT_PROVIDER_UNCONFIGURED when Chariow env is missing', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue({
      customerFirstName: 'Awa',
      customerLastName: 'Diarra',
      customerPhoneLocal: '73010538',
      customerPhoneCountryIso2: 'ML',
    } as never);
    getChariowClientMock.mockImplementationOnce(() => {
      throw new ChariowUnconfiguredError();
    });

    const res = await POST(makePost());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_PROVIDER_UNCONFIGURED');
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('502 CHARIOW_CHECKOUT_FAILED when the checkout call throws', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRow() as never);
    prismaMock.subscriptionPayment.findFirst.mockResolvedValue(null);
    getChariowClientMock.mockReturnValue(
      chariowClientMock({
        createCheckout: vi.fn(async () => {
          throw new Error('Chariow checkout failed: HTTP 400');
        }),
      }),
    );

    const res = await POST(makePost(CONTACT));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('CHARIOW_CHECKOUT_FAILED');
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });
});
