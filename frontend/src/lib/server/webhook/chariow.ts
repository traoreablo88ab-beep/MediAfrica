// frontend/src/lib/server/webhook/chariow.ts
//
// Re-exports the WebhookProvider impl from subscriptions/chariow-client.ts so
// the webhook namespace is cohesive (handler factory + per-provider impls) —
// same pattern as webhook/bictorys.ts.
//
// Lazy-init env reads (supports vi.stubEnv in tests).
import 'server-only';
import type { WebhookProvider } from './handler';
import { createChariowClient, type ChariowPulsePayload } from '../subscriptions/chariow-client';

export type { ChariowPulsePayload };

let _provider: WebhookProvider<ChariowPulsePayload> | null = null;

/** Lazy-init — env reads happen at first call so `vi.stubEnv` works in tests. */
export function getChariowWebhookProvider(): WebhookProvider<ChariowPulsePayload> {
  if (_provider) return _provider;
  const apiUrl = process.env.CHARIOW_API_URL || 'https://api.chariow.com/v1';
  const apiKey = process.env.CHARIOW_API_KEY ?? '';
  const webhookSecret = process.env.CHARIOW_WEBHOOK_SECRET ?? '';

  if (!apiKey || !webhookSecret) {
    throw new Error(
      'Chariow webhook provider not configured (CHARIOW_API_KEY/_WEBHOOK_SECRET missing)',
    );
  }
  _provider = createChariowClient({
    CHARIOW_API_URL: apiUrl,
    CHARIOW_API_KEY: apiKey,
    CHARIOW_WEBHOOK_SECRET: webhookSecret,
  }).webhookProvider;
  return _provider;
}

/** Convenience binding for the route file. */
export const chariowWebhookProvider: WebhookProvider<ChariowPulsePayload> = {
  name: 'chariow',
  verifySignature: (raw, headers) => getChariowWebhookProvider().verifySignature(raw, headers),
  parsePayload: (raw) => getChariowWebhookProvider().parsePayload(raw),
  extractIds: (payload) => getChariowWebhookProvider().extractIds(payload),
};

/** Test-only — clear the cached provider for `vi.stubEnv` reuse. */
export function __resetChariowWebhookProvider(): void {
  _provider = null;
}
