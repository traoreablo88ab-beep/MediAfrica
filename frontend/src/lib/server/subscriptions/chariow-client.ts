/**
 * Chariow client — subscription checkout (hosted mobile-money/card page),
 * sale reconciliation, and webhook signature verification.
 *
 * Chariow is NOT a `PaymentProvider` (see payments/provider.ts): its
 * checkout has no arbitrary-amount field — the price lives on a pre-created
 * `product_id` configured in the merchant's own Chariow dashboard. Here that
 * product id comes from `Plan.chariowProductId` (one per admin-managed
 * plan), not a fixed env var — MediAfrica supports an arbitrary number of
 * plans, unlike a hardcoded 2-tier model. This is a dedicated module for
 * that reason, not an oversight — see payments/provider-singleton.ts for the
 * Bictorys-based patient/customer flow this deliberately does not touch.
 *
 * API contract (per Chariow.md.md at the repo root):
 *   - Base: CHARIOW_API_URL (default https://api.chariow.com/v1), auth
 *     `Authorization: Bearer <api_key>`.
 *   - POST /checkout — body { product_id, email, first_name, last_name,
 *     phone: { number, country_code }, redirect_url, custom_metadata }.
 *     `phone.number` MUST be the LOCAL number (no leading 0, no country
 *     prefix); `phone.country_code` is ISO2 (e.g. "ML"), never a dialing
 *     code. Raw E.164 in `number` → 400 "Invalid phone number" — the single
 *     biggest source of integration failures per Chariow.md.md.
 *   - GET /sales/{id} — reconciliation pull, the actual source of truth
 *     (see subscriptions/reconcile.ts — we never credit from the webhook
 *     body alone).
 *   - Pulse webhook signature: header `x-chariow-signature` =
 *     "sha256=" + hex(HMAC_SHA256(rawBody, secret)), timing-safe compare.
 */
import 'server-only';
import crypto from 'node:crypto';
import { createLogger } from '../logger';
import type { WebhookProvider, ParsedIds } from '../webhook/handler';

const logger = createLogger();

// ───────────────────────────────────────────────────────────────────────
// Env shape
// ───────────────────────────────────────────────────────────────────────

export interface ChariowEnv {
  CHARIOW_API_URL: string;
  CHARIOW_API_KEY: string;
  /** Pulse HMAC secret, generated in the Chariow dashboard. */
  CHARIOW_WEBHOOK_SECRET: string;
}

// ───────────────────────────────────────────────────────────────────────
// Checkout
// ───────────────────────────────────────────────────────────────────────

export interface ChariowCheckoutInput {
  /** plan.chariowProductId — resolved by the caller, not by this client. */
  productId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** LOCAL number — no leading 0, no country prefix. */
  phoneLocal: string;
  /** ISO2 country code, e.g. "ML". */
  phoneCountryIso2: string;
  redirectUrl: string;
  metadata?: Record<string, string>;
}

export interface ChariowCheckoutResult {
  step: 'payment' | 'completed' | 'unknown';
  purchaseId: string;
  status: string;
  checkoutUrl: string | null;
  amount?: { value: number; currency: string };
}

export interface ChariowSaleStatus {
  status: string;
  amount?: { value: number; currency: string };
  settledAt?: Date;
  paidAt?: Date;
}

// ───────────────────────────────────────────────────────────────────────
// Pulse (webhook) payload — loosely typed, envelope not fully confirmed
// ───────────────────────────────────────────────────────────────────────

export interface ChariowPulsePayload {
  event?: string;
  type?: string;
  data?: {
    purchase?: { id?: string; status?: string };
    id?: string;
    status?: string;
  };
  sale?: { id?: string; status?: string };
  sale_id?: string;
  license?: { id?: string; status?: string };
  id?: string;
  status?: string;
  [key: string]: unknown;
}

const HTTP_TIMEOUT_MS = 30_000;

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Chariow status → normalized outcome. Order of checks is load-bearing:
 * "unpaid" must be caught BEFORE the "paid" substring test, since
 * "unpaid".includes("paid") is true. Testing failure/cancellation before
 * success avoids a similar trap with any future overlapping status strings.
 */
export function mapChariowStatus(
  raw: string | undefined,
): 'succeeded' | 'failed' | 'abandoned' | 'pending' {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'unpaid') return 'pending';
  if (/fail|error/.test(s)) return 'failed';
  if (/cancel|abandon|refund/.test(s)) return 'abandoned';
  if (/settle|complete|paid|success/.test(s)) return 'succeeded';
  return 'pending';
}

export interface ChariowClient {
  createCheckout(input: ChariowCheckoutInput): Promise<ChariowCheckoutResult>;
  getSale(saleId: string): Promise<ChariowSaleStatus>;
  webhookProvider: WebhookProvider<ChariowPulsePayload>;
}

export function createChariowClient(env: ChariowEnv): ChariowClient {
  if (!env.CHARIOW_API_URL) throw new Error('createChariowClient: CHARIOW_API_URL is required');
  if (!env.CHARIOW_API_KEY) throw new Error('createChariowClient: CHARIOW_API_KEY is required');
  if (!env.CHARIOW_WEBHOOK_SECRET)
    throw new Error('createChariowClient: CHARIOW_WEBHOOK_SECRET is required');

  const baseUrl = env.CHARIOW_API_URL.replace(/\/+$/, '');

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      return await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.CHARIOW_API_KEY}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Chariow network error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function createCheckout(input: ChariowCheckoutInput): Promise<ChariowCheckoutResult> {
    const body = {
      product_id: input.productId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: { number: input.phoneLocal, country_code: input.phoneCountryIso2.toUpperCase() },
      redirect_url: input.redirectUrl,
      ...(input.metadata ? { custom_metadata: input.metadata } : {}),
    };

    const res = await request('/checkout', { method: 'POST', body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Chariow checkout failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }

    let json: {
      data?: {
        step?: string;
        purchase?: { id?: string; status?: string; amount?: { value: number; currency: string } };
        payment?: { checkout_url?: string | null };
      };
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Chariow checkout returned non-JSON: ${text.slice(0, 300)}`);
    }

    const purchaseId = json.data?.purchase?.id ?? '';
    if (!purchaseId) throw new Error('Chariow checkout returned no purchase id');

    const rawStep = json.data?.step;
    const step: ChariowCheckoutResult['step'] =
      rawStep === 'payment' || rawStep === 'completed' ? rawStep : 'unknown';
    if (step === 'unknown') {
      logger.warn(
        '[chariow] checkout returned unrecognized step — falling back to reconciliation',
        { rawStep, purchaseId },
      );
    }

    const result: ChariowCheckoutResult = {
      step,
      purchaseId,
      status: json.data?.purchase?.status ?? '',
      checkoutUrl: json.data?.payment?.checkout_url ?? null,
    };
    if (json.data?.purchase?.amount) result.amount = json.data.purchase.amount;
    return result;
  }

  async function getSale(saleId: string): Promise<ChariowSaleStatus> {
    const res = await request(`/sales/${encodeURIComponent(saleId)}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Chariow getSale failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    let json: {
      data?: {
        status?: string;
        amount?: { value: number; currency: string };
        settled_at?: string;
        paid_at?: string;
        completed_at?: string;
      };
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Chariow getSale returned non-JSON: ${text.slice(0, 300)}`);
    }
    const d = json.data ?? {};
    const result: ChariowSaleStatus = { status: d.status ?? '' };
    if (d.amount) result.amount = d.amount;
    const settled = d.settled_at ?? d.completed_at;
    if (settled) result.settledAt = new Date(settled);
    if (d.paid_at) result.paidAt = new Date(d.paid_at);
    return result;
  }

  const webhookProvider: WebhookProvider<ChariowPulsePayload> = {
    name: 'chariow',

    verifySignature(rawBody, headers) {
      if (process.env.SMOKE_BYPASS_WEBHOOK_VERIFY === '1') {
        logger.warn(
          '[chariow] !! SMOKE_BYPASS_WEBHOOK_VERIFY=1 — webhook signature ACCEPTED unconditionally. NEVER set this in production.',
        );
        return { valid: true };
      }

      const received = headers['x-chariow-signature'];
      if (!received) return { valid: false, reason: 'missing x-chariow-signature header' };
      if (!received.startsWith('sha256=')) {
        return { valid: false, reason: 'unsupported signature scheme' };
      }

      const expected =
        'sha256=' +
        crypto.createHmac('sha256', env.CHARIOW_WEBHOOK_SECRET).update(rawBody).digest('hex');

      if (!timingSafeStringEqual(received, expected)) {
        return { valid: false, reason: 'signature mismatch' };
      }
      return { valid: true };
    },

    parsePayload(rawBody) {
      return JSON.parse(rawBody.toString('utf8')) as ChariowPulsePayload;
    },

    extractIds(payload): ParsedIds {
      const externalId = String(
        payload.data?.purchase?.id ??
          payload.data?.id ??
          payload.sale?.id ??
          payload.sale_id ??
          payload.license?.id ??
          payload.id ??
          '',
      );
      if (!externalId) {
        logger.warn('[chariow] webhook payload has no recognizable id field', {
          keys: Object.keys(payload),
        });
      }
      const eventType = String(payload.event ?? payload.type ?? 'unknown');
      const kind: ParsedIds['kind'] =
        eventType === 'successful.sale' ||
        eventType === 'settled.sale' ||
        eventType === 'completed.sale' ||
        eventType === 'license.activated'
          ? 'paid'
          : eventType === 'failed.sale' || eventType === 'license.revoked'
            ? 'failed'
            : 'other';
      return { externalId, eventType, kind };
    },
  };

  return { createCheckout, getSale, webhookProvider };
}
