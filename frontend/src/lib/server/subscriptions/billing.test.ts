import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { runSubscriptionBilling } from './billing';

const NOW = new Date('2026-06-15T06:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(n: number): Date {
  return new Date(NOW.getTime() + n * DAY_MS);
}

function subRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    status: 'TRIALING',
    currentPeriodEnd: daysFromNow(7),
    reminder7dSentAt: null,
    reminder5dSentAt: null,
    reminder3dSentAt: null,
    reminderOverdueSentAt: null,
    organization: {
      id: 'org-1',
      name: 'CSRéf de Gao',
      owner: { email: 'owner@gao.test' },
    },
    ...overrides,
  };
}

// runSubscriptionBilling issues exactly 5 sequential subscription.findMany
// calls, in this order: J-7, J-5, J-3, overdue+1, then the day-0 due sweep.
// Queueing 5 mockResolvedValueOnce calls (empty by default) mirrors that
// order without needing to type-inspect the Prisma `where` shape per call.
function queueFindMany(overrides: Partial<Record<number, unknown>> = {}) {
  const calls = [[], [], [], [], []].map((def, i) => overrides[i] ?? def);
  for (const rows of calls) {
    prismaMock.subscription.findMany.mockResolvedValueOnce(rows as never);
  }
}

beforeEach(() => {
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
});

describe('runSubscriptionBilling — reminder ladder', () => {
  it('sends a J-7 reminder and stamps reminder7dSentAt', async () => {
    queueFindMany({ 0: [subRow()] });

    const result = await runSubscriptionBilling({ prisma: prismaMock, now: NOW });

    expect(result.remindersSent).toBe(1);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { reminder7dSentAt: NOW },
    });
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'email.subscription_reminder',
          payload: expect.objectContaining({
            to: 'owner@gao.test',
            clinicName: 'CSRéf de Gao',
            stage: 'j7',
          }),
        }),
      }),
    );
  });

  it('the J-7 query excludes subscriptions that already got that reminder', async () => {
    queueFindMany();
    await runSubscriptionBilling({ prisma: prismaMock, now: NOW });
    const firstCallArgs = prismaMock.subscription.findMany.mock.calls[0]?.[0] as {
      where?: { reminder7dSentAt?: null };
    };
    expect(firstCallArgs?.where?.reminder7dSentAt).toBeNull();
  });

  it('sends the J-5 and J-3 reminders on their own stage', async () => {
    queueFindMany({ 1: [subRow({ id: 'sub-5' })], 2: [subRow({ id: 'sub-3' })] });

    const result = await runSubscriptionBilling({ prisma: prismaMock, now: NOW });

    expect(result.remindersSent).toBe(2);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-5' },
      data: { reminder5dSentAt: NOW },
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-3' },
      data: { reminder3dSentAt: NOW },
    });
  });

  it('sends the overdue+1 reminder only to PAST_DUE subscriptions, one day after expiry', async () => {
    queueFindMany({
      3: [subRow({ id: 'sub-overdue', status: 'PAST_DUE', currentPeriodEnd: daysFromNow(-1) })],
    });

    const result = await runSubscriptionBilling({ prisma: prismaMock, now: NOW });

    expect(result.remindersSent).toBe(1);
    const overdueQueryArgs = prismaMock.subscription.findMany.mock.calls[3]?.[0] as {
      where?: { status?: { in: string[] } };
    };
    expect(overdueQueryArgs?.where?.status).toEqual({ in: ['PAST_DUE'] });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-overdue' },
      data: { reminderOverdueSentAt: NOW },
    });
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ stage: 'overdue1' }),
        }),
      }),
    );
  });
});

describe('runSubscriptionBilling — existing due/cancel behavior', () => {
  it('marks a subscription PAST_DUE once its period has ended', async () => {
    queueFindMany({ 4: [subRow({ status: 'ACTIVE', currentPeriodEnd: daysFromNow(-2) })] });

    const result = await runSubscriptionBilling({ prisma: prismaMock, now: NOW });

    expect(result.markedPastDue).toBe(1);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE' },
    });
  });

  it('cancels subscriptions PAST_DUE for longer than the grace period', async () => {
    queueFindMany();
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 2 });
    const result = await runSubscriptionBilling({ prisma: prismaMock, now: NOW });
    expect(result.canceled).toBe(2);
  });
});
