/**
 * POST /api/webhooks/chariow — Chariow Pulse webhook adapter.
 *
 * Thin shim over the battle-tested factory at `lib/server/webhook/handler.ts`
 * (PROTECTED — never modified). The factory does the hard work: raw-body
 * read via arrayBuffer, HMAC verify, Serializable transaction, WebhookLog
 * upsert + dedup, dispatch, processedAt write-back.
 *
 * Unlike webhook/bictorys.ts's onPaid (which credits an Order directly
 * inside this transaction), onPaid here does a DB-only timestamp nudge and
 * makes ZERO outbound network calls. Crediting a SubscriptionPayment always
 * goes through reconcilePayment() (lib/server/subscriptions/reconcile.ts),
 * called from the checkout-return poll route or the reconcile cron — never
 * from here. Reason: holding a Serializable transaction open across an
 * outbound HTTPS call (re-querying Chariow) risks starving Neon's
 * connection-limited pool, a class of incident this project has already hit
 * once (local dev connection_limit=1 serializing every query).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { chariowWebhookProvider } from '@/lib/server/webhook/chariow';
import { prisma } from '@/lib/server/prisma';

export const POST = createWebhookHandler({
  prisma,
  provider: chariowWebhookProvider,

  async onPaid(payload, tx) {
    const externalId = String(
      payload.data?.purchase?.id ??
        payload.data?.id ??
        payload.sale?.id ??
        payload.sale_id ??
        payload.license?.id ??
        payload.id ??
        '',
    );
    if (!externalId) return {};

    const payment = await tx.subscriptionPayment.findUnique({
      where: { provider_providerSaleId: { provider: 'chariow', providerSaleId: externalId } },
    });
    if (!payment) return {}; // unknown sale — log + drop, no row to nudge

    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: { lastWebhookAt: new Date() },
    });

    return {};
  },

  async onFailed(payload, tx) {
    const externalId = String(
      payload.data?.purchase?.id ??
        payload.data?.id ??
        payload.sale?.id ??
        payload.sale_id ??
        payload.license?.id ??
        payload.id ??
        '',
    );
    if (!externalId) return {};

    const payment = await tx.subscriptionPayment.findUnique({
      where: { provider_providerSaleId: { provider: 'chariow', providerSaleId: externalId } },
    });
    if (!payment) return {};

    // Optimistic — self-heals via the reconcile cron's CHARIOW_FAILED_RECHECK_DAYS
    // window if this turns out to have been a false failure.
    await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    return {};
  },
});
