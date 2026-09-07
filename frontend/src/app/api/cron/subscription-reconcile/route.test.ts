import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

const reconcileSubscriptionsMock = vi.fn();
vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcileSubscriptions: reconcileSubscriptionsMock,
}));

const getChariowClientMock = vi.fn();
class ChariowUnconfiguredError extends Error {}
vi.mock('@/lib/server/subscriptions/chariow-singleton', () => ({
  getChariowClient: getChariowClientMock,
  ChariowUnconfiguredError,
}));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  reconcileSubscriptionsMock.mockReset();
  getChariowClientMock.mockReset();
  getChariowClientMock.mockReturnValue({ createCheckout: vi.fn(), getSale: vi.fn() });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/subscription-reconcile', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/subscription-reconcile', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('skips reconciliation and still returns 200 when Chariow is unconfigured', async () => {
    getChariowClientMock.mockImplementationOnce(() => {
      throw new ChariowUnconfiguredError();
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 0 });
    expect(reconcileSubscriptionsMock).not.toHaveBeenCalled();
  });

  it('calls reconcileSubscriptions and returns the reconciled count', async () => {
    reconcileSubscriptionsMock.mockResolvedValueOnce({
      reconciled: 3,
      activated: 1,
      expiredPayments: 0,
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 3 });
    expect(reconcileSubscriptionsMock).toHaveBeenCalled();
  });
});
