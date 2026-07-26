import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { requireActiveSubscription } from './access-guard';

describe('requireActiveSubscription', () => {
  it('returns null (allowed) when the subscription is TRIALING', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ status: 'TRIALING' } as never);
    const result = await requireActiveSubscription('org-1');
    expect(result).toBeNull();
  });

  it('returns null (allowed) when the subscription is ACTIVE', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' } as never);
    const result = await requireActiveSubscription('org-1');
    expect(result).toBeNull();
  });

  it('returns null (allowed) when there is no subscription row at all', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const result = await requireActiveSubscription('org-1');
    expect(result).toBeNull();
  });

  it('blocks with 402 SUBSCRIPTION_INACTIVE when PAST_DUE', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ status: 'PAST_DUE' } as never);
    const result = await requireActiveSubscription('org-1');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(402);
    const body = await result?.json();
    expect(body.error).toBe('SUBSCRIPTION_INACTIVE');
  });

  it('blocks with 402 SUBSCRIPTION_INACTIVE when CANCELED', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ status: 'CANCELED' } as never);
    const result = await requireActiveSubscription('org-1');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(402);
  });

  it('scopes the lookup to the given organizationId', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' } as never);
    await requireActiveSubscription('org-42');
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-42' },
      select: { status: true },
    });
  });
});
