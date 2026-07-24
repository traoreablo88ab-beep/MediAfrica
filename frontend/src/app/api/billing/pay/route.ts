// POST /api/billing/pay — charge the caller's clinic for its current
// subscription period. Mirrors the charge sequence in /api/orders
// (PENDING Order → CircuitBreaker-wrapped provider.charge → paymentUrl),
// but the amount/currency/organizationId/subscriptionId are ALWAYS derived
// server-side from the caller's own subscription — the request body carries
// no ID or amount fields at all, so there is nothing a client could tamper
// with to charge a different clinic's subscription.
//
// Idempotency key is server-derived (`sub:{subscriptionId}:{currentPeriodEnd}`)
// instead of a client-supplied header — one Order per clinic per billing
// period, deterministically. A FAILED/EXPIRED prior attempt for the same
// period is retried by reusing that same row (not spawning a new key).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import {
  breaker,
  getProvider,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';

const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const organizationId = auth.orgMember.organizationId;
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND', message: 'No subscription found for this clinic' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const idempotencyKey = `sub:${subscription.id}:${subscription.currentPeriodEnd.toISOString()}`;
    let order = await prisma.order.findUnique({ where: { idempotencyKey } });

    if (order) {
      if (order.status === 'PENDING' && !order.paymentUrl) {
        return NextResponse.json(
          { error: 'PAYMENT_IN_FLIGHT', message: 'Prior attempt did not complete; retry shortly.' },
          { status: 503, headers: { 'x-request-id': ctx.requestId, 'Retry-After': '5' } },
        );
      }
      if (order.status === 'PENDING' || order.status === 'PAID') {
        return NextResponse.json(
          { id: order.id, paymentUrl: order.paymentUrl, status: order.status },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      // FAILED / EXPIRED / REFUNDED — fall through and retry via this row.
    }

    let provider;
    try {
      provider = getProvider();
    } catch (err) {
      if (err instanceof PaymentProviderUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const envPublicUrl = process.env.PUBLIC_URL;
    if (!envPublicUrl && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: 'PUBLIC_URL not set; cannot construct success/failure redirect URLs.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const publicUrl = envPublicUrl ?? 'http://localhost:3000';

    if (!order) {
      order = await prisma.order.create({
        data: {
          userId: auth.user.sub,
          organizationId,
          subscriptionId: subscription.id,
          amount: subscription.plan.priceAmount,
          currency: subscription.plan.currency,
          provider: 'bictorys',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
          idempotencyKey,
          customerEmail: auth.user.email,
        },
      });
    }

    try {
      const result = await breaker.execute(() =>
        provider.charge({
          amount: order!.amount,
          currency: order!.currency,
          customer: { email: auth.user.email },
          successUrl: `${publicUrl}/facturation?paid=1`,
          failureUrl: `${publicUrl}/facturation?failed=1`,
          externalRef: order!.id,
        }),
      );

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'PENDING',
          providerChargeId: result.providerChargeId,
          paymentUrl: result.paymentUrl,
        },
      });

      return NextResponse.json(
        { id: updated.id, paymentUrl: updated.paymentUrl, status: 'PENDING' },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        const retryAfterSec = Math.max(1, Math.ceil((err.retryAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          {
            error: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'Payment provider temporarily unavailable. Try again shortly.',
          },
          {
            status: 503,
            headers: { 'x-request-id': ctx.requestId, 'Retry-After': String(retryAfterSec) },
          },
        );
      }
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      const message = err instanceof Error ? err.message : 'Unknown payment error';
      return NextResponse.json(
        { error: 'PAYMENT_FAILED', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
