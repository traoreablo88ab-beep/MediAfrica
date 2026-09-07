// frontend/src/test-utils/chariow-mock.ts
//
// Fixture builder for /api/webhooks/chariow route tests. Returns:
//   - rawBody (Buffer) — exact bytes Chariow would have signed
//   - headers (Record<string,string>) — including a valid x-chariow-signature
//   - payload (ChariowPulsePayload) — the parsed shape
//
// HMAC algorithm mirrors `frontend/src/lib/server/subscriptions/chariow-client.ts`
// verbatim ("sha256=" + hex(HMAC_SHA256(rawBody, secret))). Drift between
// fixture and verifier is impossible by construction — the fixture re-derives
// from the same canonical recipe.
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import type { ChariowPulsePayload } from '@/lib/server/subscriptions/chariow-client';

export interface ChariowFixtureOpts {
  event?: string;
  saleId?: string;
  webhookSecret?: string;
}

export function chariowFixture(opts: ChariowFixtureOpts = {}): {
  rawBody: Buffer;
  headers: Record<string, string>;
  payload: ChariowPulsePayload;
} {
  const event = opts.event ?? 'successful.sale';
  const saleId = opts.saleId ?? 'sal_test_001';
  const payload: ChariowPulsePayload = {
    event,
    data: { purchase: { id: saleId, status: 'completed' } },
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const secret = opts.webhookSecret ?? 'test-chariow-webhook-secret';
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return {
    rawBody,
    headers: { 'content-type': 'application/json', 'x-chariow-signature': sig },
    payload,
  };
}

/** Build a NextRequest with the fixture body + headers. Use in route tests. */
export function chariowFixtureRequest(opts: ChariowFixtureOpts = {}): {
  req: NextRequest;
  payload: ChariowPulsePayload;
} {
  const { rawBody, headers, payload } = chariowFixture(opts);
  const body = rawBody as unknown as BodyInit;
  return {
    req: new NextRequest('http://localhost/api/webhooks/chariow', {
      method: 'POST',
      headers,
      body,
    }),
    payload,
  };
}
