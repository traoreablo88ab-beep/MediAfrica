import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapChariowStatus, createChariowClient } from './chariow-client';
import { chariowFixture } from '@/test-utils/chariow-mock';

const ENV = {
  CHARIOW_API_URL: 'https://api.chariow.test',
  CHARIOW_API_KEY: 'test-key',
  CHARIOW_WEBHOOK_SECRET: 'test-chariow-webhook-secret',
};

describe('mapChariowStatus', () => {
  it('"unpaid" maps to pending — NOT succeeded (the substring trap)', () => {
    expect(mapChariowStatus('unpaid')).toBe('pending');
  });

  it('maps settle/complete/paid/success variants to succeeded', () => {
    expect(mapChariowStatus('settled')).toBe('succeeded');
    expect(mapChariowStatus('complete')).toBe('succeeded');
    expect(mapChariowStatus('paid')).toBe('succeeded');
    expect(mapChariowStatus('success')).toBe('succeeded');
  });

  it('maps failed/error to failed', () => {
    expect(mapChariowStatus('failed')).toBe('failed');
    expect(mapChariowStatus('error')).toBe('failed');
  });

  it('maps cancel/abandon/refund to abandoned', () => {
    expect(mapChariowStatus('cancelled')).toBe('abandoned');
    expect(mapChariowStatus('abandoned')).toBe('abandoned');
    expect(mapChariowStatus('refunded')).toBe('abandoned');
  });

  it('unknown/undefined falls back to pending', () => {
    expect(mapChariowStatus('something_else')).toBe('pending');
    expect(mapChariowStatus(undefined)).toBe('pending');
  });
});

describe('createChariowClient — env validation', () => {
  it('throws when CHARIOW_API_URL is missing', () => {
    expect(() => createChariowClient({ ...ENV, CHARIOW_API_URL: '' })).toThrow(/CHARIOW_API_URL/);
  });
  it('throws when CHARIOW_API_KEY is missing', () => {
    expect(() => createChariowClient({ ...ENV, CHARIOW_API_KEY: '' })).toThrow(/CHARIOW_API_KEY/);
  });
  it('throws when CHARIOW_WEBHOOK_SECRET is missing', () => {
    expect(() => createChariowClient({ ...ENV, CHARIOW_WEBHOOK_SECRET: '' })).toThrow(
      /CHARIOW_WEBHOOK_SECRET/,
    );
  });
});

describe('createCheckout', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the caller-provided productId, LOCAL phone number + ISO2 country_code (not E.164)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            step: 'payment',
            purchase: { id: 'sal_1', status: 'pending' },
            payment: { checkout_url: 'https://payment.chariow.com/x' },
          },
        }),
        { status: 200 },
      ),
    );
    const client = createChariowClient(ENV);
    await client.createCheckout({
      productId: 'prod_plan_1',
      email: 'a@b.com',
      firstName: 'Awa',
      lastName: 'Diarra',
      phoneLocal: '73010538',
      phoneCountryIso2: 'ml',
      redirectUrl: 'https://app.test/retour',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.phone).toEqual({ number: '73010538', country_code: 'ML' });
    expect(body.product_id).toBe('prod_plan_1');
  });

  it('unrecognized step is returned as "unknown", not misread as success/failure', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            step: 'otp_required',
            purchase: { id: 'sal_2', status: 'pending' },
            payment: { checkout_url: null },
          },
        }),
        { status: 200 },
      ),
    );
    const client = createChariowClient(ENV);
    const result = await client.createCheckout({
      productId: 'prod_plan_2',
      email: 'a@b.com',
      firstName: 'Awa',
      lastName: 'Diarra',
      phoneLocal: '73010538',
      phoneCountryIso2: 'ML',
      redirectUrl: 'https://app.test/retour',
    });
    expect(result.step).toBe('unknown');
  });

  it('throws with the HTTP status + body on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Invalid phone number' }), { status: 400 }),
    );
    const client = createChariowClient(ENV);
    await expect(
      client.createCheckout({
        productId: 'prod_plan_1',
        email: 'a@b.com',
        firstName: 'Awa',
        lastName: 'Diarra',
        phoneLocal: 'bad',
        phoneCountryIso2: 'ML',
        redirectUrl: 'https://app.test/retour',
      }),
    ).rejects.toThrow(/400/);
  });
});

describe('getSale', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('parses settled_at as settledAt', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            status: 'settled',
            amount: { value: 5000, currency: 'XOF' },
            settled_at: '2026-01-01T00:00:00Z',
          },
        }),
        { status: 200 },
      ),
    );
    const client = createChariowClient(ENV);
    const sale = await client.getSale('sal_1');
    expect(sale.status).toBe('settled');
    expect(sale.settledAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(sale.amount).toEqual({ value: 5000, currency: 'XOF' });
  });
});

describe('webhookProvider.verifySignature', () => {
  it('accepts a validly-signed payload', () => {
    const client = createChariowClient(ENV);
    const { rawBody, headers } = chariowFixture({ webhookSecret: ENV.CHARIOW_WEBHOOK_SECRET });
    const result = client.webhookProvider.verifySignature(rawBody, headers);
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const client = createChariowClient(ENV);
    const { rawBody, headers } = chariowFixture({ webhookSecret: ENV.CHARIOW_WEBHOOK_SECRET });
    const tampered = Buffer.from(rawBody.toString('utf8').replace('successful', 'failed'));
    const result = client.webhookProvider.verifySignature(tampered, headers);
    expect(result.valid).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const client = createChariowClient(ENV);
    const { rawBody } = chariowFixture({ webhookSecret: ENV.CHARIOW_WEBHOOK_SECRET });
    const result = client.webhookProvider.verifySignature(rawBody, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/missing/);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const client = createChariowClient(ENV);
    const { rawBody, headers } = chariowFixture({ webhookSecret: 'wrong-secret' });
    const result = client.webhookProvider.verifySignature(rawBody, headers);
    expect(result.valid).toBe(false);
  });

  it('SMOKE_BYPASS_WEBHOOK_VERIFY=1 accepts unconditionally (dev escape hatch)', () => {
    vi.stubEnv('SMOKE_BYPASS_WEBHOOK_VERIFY', '1');
    const client = createChariowClient(ENV);
    const result = client.webhookProvider.verifySignature(Buffer.from('anything'), {});
    expect(result.valid).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe('webhookProvider.extractIds', () => {
  it('extracts purchase id + event, classifies successful.sale as paid', () => {
    const client = createChariowClient(ENV);
    const { payload } = chariowFixture({ event: 'successful.sale', saleId: 'sal_abc' });
    const ids = client.webhookProvider.extractIds(payload);
    expect(ids).toEqual({ externalId: 'sal_abc', eventType: 'successful.sale', kind: 'paid' });
  });

  it('classifies failed.sale as failed', () => {
    const client = createChariowClient(ENV);
    const { payload } = chariowFixture({ event: 'failed.sale', saleId: 'sal_abc' });
    const ids = client.webhookProvider.extractIds(payload);
    expect(ids.kind).toBe('failed');
  });

  it('classifies an unrecognized event as other', () => {
    const client = createChariowClient(ENV);
    const { payload } = chariowFixture({ event: 'license.nearing_expiry', saleId: 'sal_abc' });
    const ids = client.webhookProvider.extractIds(payload);
    expect(ids.kind).toBe('other');
  });
});
