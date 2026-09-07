import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  chariowWebhookProvider,
  getChariowWebhookProvider,
  __resetChariowWebhookProvider,
} from './chariow';

const SECRET = 'test-chariow-webhook-secret';

beforeEach(() => {
  vi.stubEnv('CHARIOW_API_URL', 'https://api.chariow.test');
  vi.stubEnv('CHARIOW_API_KEY', 'test-api-key');
  vi.stubEnv('CHARIOW_WEBHOOK_SECRET', SECRET);
  __resetChariowWebhookProvider();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetChariowWebhookProvider();
});

describe('chariowWebhookProvider', () => {
  it('verifies a valid HMAC signature', () => {
    const body = Buffer.from(JSON.stringify({ event: 'successful.sale' }));
    const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const r = chariowWebhookProvider.verifySignature(body, { 'x-chariow-signature': sig });
    expect(r.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ event: 'successful.sale' }));
    const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const tampered = Buffer.from(JSON.stringify({ event: 'failed.sale' }));
    const r = chariowWebhookProvider.verifySignature(tampered, { 'x-chariow-signature': sig });
    expect(r.valid).toBe(false);
  });

  it('throws when env unset (lazy init)', () => {
    vi.stubEnv('CHARIOW_API_KEY', '');
    __resetChariowWebhookProvider();
    expect(() => getChariowWebhookProvider()).toThrow(/not configured/i);
  });

  it('extractIds classifies successful.sale as paid', () => {
    const payload = { event: 'successful.sale', data: { purchase: { id: 'sal_1' } } };
    const ids = chariowWebhookProvider.extractIds(payload as never);
    expect(ids).toEqual({ externalId: 'sal_1', eventType: 'successful.sale', kind: 'paid' });
  });
});
