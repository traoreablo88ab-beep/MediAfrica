// Lazy-initialized Chariow client — mirrors payments/provider-singleton.ts.
//
// `createChariowClient({...})` throws synchronously if any required env var
// is missing. Calling it at module top-level inside a route would crash the
// route-module on import. This module instead exposes `getChariowClient()`
// which constructs the client on first call, caches it, and throws a typed
// `ChariowUnconfiguredError` if env is missing — routes catch that and
// return a clean 503.
//
// No module-level CircuitBreaker here (unlike provider-singleton.ts's
// Bictorys `breaker`): Chariow calls are pulled by the checkout-return poll
// route and the reconcile cron, not hammered synchronously inside a
// user-facing charge path — deliberate v1 simplification, not an oversight.
import 'server-only';
import { createChariowClient, type ChariowClient } from './chariow-client';

export class ChariowUnconfiguredError extends Error {
  constructor() {
    super('Chariow not configured (CHARIOW_API_KEY / CHARIOW_WEBHOOK_SECRET missing or empty)');
    this.name = 'ChariowUnconfiguredError';
  }
}

let _client: ChariowClient | null = null;

export function getChariowClient(): ChariowClient {
  if (_client) return _client;

  const apiUrl = process.env.CHARIOW_API_URL || 'https://api.chariow.com/v1';
  const apiKey = process.env.CHARIOW_API_KEY ?? '';
  const webhookSecret = process.env.CHARIOW_WEBHOOK_SECRET ?? '';

  if (!apiKey || !webhookSecret) {
    throw new ChariowUnconfiguredError();
  }

  _client = createChariowClient({
    CHARIOW_API_URL: apiUrl,
    CHARIOW_API_KEY: apiKey,
    CHARIOW_WEBHOOK_SECRET: webhookSecret,
  });
  return _client;
}

/** Test-only — clears the cached client so `vi.stubEnv` can re-trigger lazy init. @internal */
export function __resetChariowClientSingleton(): void {
  _client = null;
}
