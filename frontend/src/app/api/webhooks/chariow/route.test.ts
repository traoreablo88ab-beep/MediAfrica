import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chariowFixtureRequest, chariowFixture } from '@/test-utils/chariow-mock';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const paymentFindUnique = vi.fn();
const paymentUpdate = vi.fn();
const paymentUpdateMany = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
  fn({
    webhookLog: { findUnique, create, update },
    subscriptionPayment: {
      findUnique: paymentFindUnique,
      update: paymentUpdate,
      updateMany: paymentUpdateMany,
    },
  }),
);

vi.mock('@/lib/server/prisma', () => ({
  prisma: { $transaction },
}));

beforeEach(() => {
  vi.stubEnv('CHARIOW_API_URL', 'https://api.chariow.test');
  vi.stubEnv('CHARIOW_API_KEY', 'test-api-key');
  vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 'test-chariow-webhook-secret');
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
  paymentFindUnique.mockReset();
  paymentUpdate.mockReset();
  paymentUpdateMany.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/webhooks/chariow', () => {
  it('valid HMAC + first delivery returns 200 deduped:false', async () => {
    findUnique.mockResolvedValueOnce(null);
    paymentFindUnique.mockResolvedValueOnce(null); // unknown sale — onPaid drops
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ event: 'successful.sale' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: false });
    expect(create).toHaveBeenCalled();
  });

  it('replay of same (externalId, eventType) returns deduped:true', async () => {
    findUnique.mockResolvedValueOnce({ id: 'wl1', processedAt: new Date() });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ event: 'successful.sale' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('tampered body returns 401', async () => {
    const { rawBody, headers } = chariowFixture({ event: 'successful.sale' });
    const tampered = Buffer.from(rawBody.toString('utf8').replace('successful', 'failed'));
    const { POST } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/webhooks/chariow', {
      method: 'POST',
      headers,
      body: tampered,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('onPaid finds the SubscriptionPayment by providerSaleId and only stamps lastWebhookAt — never credits, never calls out to Chariow', async () => {
    findUnique.mockResolvedValueOnce(null);
    paymentFindUnique.mockResolvedValueOnce({ id: 'pay-1', status: 'PENDING' });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ event: 'successful.sale', saleId: 'sal-1' });
    await POST(req);

    expect(paymentFindUnique).toHaveBeenCalledWith({
      where: { provider_providerSaleId: { provider: 'chariow', providerSaleId: 'sal-1' } },
    });
    expect(paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { lastWebhookAt: expect.any(Date) },
    });
    // The webhook must never flip status itself.
    expect(paymentUpdate.mock.calls[0]?.[0]?.data?.status).toBeUndefined();
  });

  it('onFailed optimistically flips a PENDING payment to FAILED', async () => {
    findUnique.mockResolvedValueOnce(null);
    paymentFindUnique.mockResolvedValueOnce({ id: 'pay-2', status: 'PENDING' });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ event: 'failed.sale', saleId: 'sal-2' });
    await POST(req);

    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'pay-2', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
