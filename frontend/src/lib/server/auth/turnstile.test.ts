import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstile } from './turnstile';

describe('verifyTurnstile', () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  });

  it('is inert (returns true, no network call) when TURNSTILE_SECRET_KEY is unset', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;

    await expect(verifyTurnstile('some-token')).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing token once configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;

    await expect(verifyTurnstile(null)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns true when Cloudflare reports success', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as never;

    await expect(verifyTurnstile('valid-token')).resolves.toBe(true);
  });

  it('returns false when Cloudflare reports failure', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as never;

    await expect(verifyTurnstile('bad-token')).resolves.toBe(false);
  });

  it('returns false when the verify request itself fails (network error)', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as never;

    await expect(verifyTurnstile('some-token')).resolves.toBe(false);
  });

  it('returns false on a non-OK HTTP response', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;

    await expect(verifyTurnstile('some-token')).resolves.toBe(false);
  });
});
