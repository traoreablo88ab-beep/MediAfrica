// Companion unit test for reconcile.ts — the sole crediting path for a
// Chariow SubscriptionPayment (see the module header: webhook nudges only,
// this is where the actual status flip + period extension happens).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import type { ChariowClient } from './chariow-client';
import { reconcilePayment, reconcileSubscriptions } from './reconcile';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

function chariowMock(overrides: Partial<ChariowClient> = {}): ChariowClient {
  return {
    createCheckout: vi.fn(),
    getSale: vi.fn(),
    webhookProvider: {} as never,
    ...overrides,
  };
}

const PAYMENT = { id: 'pay-1', providerSaleId: 'sal-1', subscriptionId: 'sub-1' };

describe('reconcilePayment', () => {
  it('flips SubscriptionPayment to SUCCEEDED and extends the subscription period on success', async () => {
    const chariow = chariowMock({
      getSale: vi.fn().mockResolvedValue({
        status: 'settled',
        settledAt: new Date('2026-06-01T00:00:00Z'),
      }),
    });
    prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
      plan: { billingIntervalDays: 30 },
    } as never);

    const result = await reconcilePayment(prismaMock, chariow, PAYMENT);

    expect(result.outcome).toBe('succeeded');
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: { in: ['PENDING', 'FAILED'] } },
      data: expect.objectContaining({ status: 'SUCCEEDED' }),
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
        trialEndsAt: null,
        reminder7dSentAt: null,
        reminder5dSentAt: null,
        reminder3dSentAt: null,
        reminderOverdueSentAt: null,
      }),
    });
  });

  it('never overwrites a SUCCEEDED row — race guard short-circuits on updateMany count 0', async () => {
    const chariow = chariowMock({
      getSale: vi.fn().mockResolvedValue({ status: 'settled' }),
    });
    prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 0 });

    await reconcilePayment(prismaMock, chariow, PAYMENT);

    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('uses sale.settledAt as succeededAt, never a bare new Date()', async () => {
    const settledAt = new Date('2025-01-01T00:00:00Z');
    const chariow = chariowMock({
      getSale: vi.fn().mockResolvedValue({ status: 'paid', settledAt }),
    });
    prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
      plan: { billingIntervalDays: 30 },
    } as never);

    await reconcilePayment(prismaMock, chariow, PAYMENT);

    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ succeededAt: settledAt }) }),
    );
  });

  it('marks a failed sale FAILED, only from PENDING', async () => {
    const chariow = chariowMock({ getSale: vi.fn().mockResolvedValue({ status: 'failed' }) });

    const result = await reconcilePayment(prismaMock, chariow, PAYMENT);

    expect(result.outcome).toBe('failed');
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  });

  it('marks a cancelled sale ABANDONED', async () => {
    const chariow = chariowMock({ getSale: vi.fn().mockResolvedValue({ status: 'cancelled' }) });

    const result = await reconcilePayment(prismaMock, chariow, PAYMENT);

    expect(result.outcome).toBe('abandoned');
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: 'PENDING' },
      data: { status: 'ABANDONED' },
    });
  });

  it('a still-pending sale only stamps lastReconciledAt on the payment row', async () => {
    const chariow = chariowMock({ getSale: vi.fn().mockResolvedValue({ status: 'pending' }) });

    const result = await reconcilePayment(prismaMock, chariow, PAYMENT);

    expect(result.outcome).toBe('pending');
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { lastReconciledAt: expect.any(Date) },
    });
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });
});

describe('reconcileSubscriptions', () => {
  it('reconciles PENDING + recently-FAILED payments, then expires stale PENDING rows', async () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const chariow = chariowMock({
      getSale: vi.fn().mockResolvedValue({ status: 'pending' }),
    });

    prismaMock.subscriptionPayment.findMany
      .mockResolvedValueOnce([{ id: 'p1', providerSaleId: 's1', subscriptionId: 'sub-1' }] as never) // toReconcile
      .mockResolvedValueOnce([
        { id: 'p2', providerSaleId: 's2', subscriptionId: 'sub-2' },
      ] as never); // stalePending
    prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });

    const result = await reconcileSubscriptions({ prisma: prismaMock, chariow, now });

    expect(result.reconciled).toBe(1);
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p2', status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    expect(result.expiredPayments).toBe(1);
  });

  it('counts an activation from the stale-PENDING last-chance pass', async () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const chariow = chariowMock({
      getSale: vi.fn().mockResolvedValue({ status: 'settled', settledAt: now }),
    });

    prismaMock.subscriptionPayment.findMany
      .mockResolvedValueOnce([] as never) // toReconcile — none
      .mockResolvedValueOnce([
        { id: 'p3', providerSaleId: 's3', subscriptionId: 'sub-3' },
      ] as never); // stalePending
    prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 'sub-3',
      currentPeriodEnd: now,
      plan: { billingIntervalDays: 30 },
    } as never);

    const result = await reconcileSubscriptions({ prisma: prismaMock, chariow, now });

    expect(result.activated).toBe(1);
    expect(result.expiredPayments).toBe(0);
  });
});
