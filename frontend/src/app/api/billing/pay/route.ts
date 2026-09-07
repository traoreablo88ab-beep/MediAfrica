// POST /api/billing/pay — start (or resume) a Chariow checkout for the
// caller's clinic subscription. Chariow bills the price of a pre-configured
// product in its own dashboard (Plan.chariowProductId) — there is no
// arbitrary-amount charge call, so this route does NOT go through the
// generic PaymentProvider/Order flow used by /api/orders; it writes to the
// dedicated SubscriptionPayment model instead (see
// lib/server/subscriptions/reconcile.ts's header for why).
//
// The organizationId/subscriptionId/plan are ALWAYS derived server-side from
// the caller's own subscription — the request body carries only the
// Chariow-required billing-contact fields (first/last name, local phone +
// country), nothing a client could tamper with to charge a different
// clinic's subscription.
//
// This route never credits the subscription itself — a successful checkout
// only returns a Chariow-hosted paymentUrl. Crediting happens exclusively in
// reconcilePayment(), called from POST /api/billing/pay/verify (checkout
// return poll) or the subscription-reconcile cron — never from this route
// and never from the webhook.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  getChariowClient,
  ChariowUnconfiguredError,
} from '@/lib/server/subscriptions/chariow-singleton';
import { reconcilePayment, pendingExpireHours } from '@/lib/server/subscriptions/reconcile';

const PayBody = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phoneLocal: z
      .string()
      .trim()
      .regex(/^\d{6,15}$/, 'invalid local phone number'),
    phoneCountryIso2: z
      .string()
      .trim()
      .length(2)
      .transform((s) => s.toUpperCase()),
  })
  .partial()
  .superRefine((val, ctx) => {
    const keys = ['firstName', 'lastName', 'phoneLocal', 'phoneCountryIso2'] as const;
    const present = keys.filter((k) => val[k] !== undefined);
    if (present.length !== 0 && present.length !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide all 4 contact fields, or none',
      });
    }
  });

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

    const parsedBody = PayBody.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsedBody.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
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

    if (!subscription.plan.chariowProductId) {
      return NextResponse.json(
        {
          error: 'PLAN_NOT_CHARIOW_CONFIGURED',
          message: 'This plan is not yet wired up to a Chariow product',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const body = parsedBody.data;
    let contact: {
      firstName: string;
      lastName: string;
      phoneLocal: string;
      phoneCountryIso2: string;
    };
    if (
      body.firstName !== undefined &&
      body.lastName !== undefined &&
      body.phoneLocal !== undefined &&
      body.phoneCountryIso2 !== undefined
    ) {
      contact = {
        firstName: body.firstName,
        lastName: body.lastName,
        phoneLocal: body.phoneLocal,
        phoneCountryIso2: body.phoneCountryIso2,
      };
    } else {
      const priorContact = await prisma.subscriptionPayment.findFirst({
        where: { subscriptionId: subscription.id },
        orderBy: { createdAt: 'desc' },
        select: {
          customerFirstName: true,
          customerLastName: true,
          customerPhoneLocal: true,
          customerPhoneCountryIso2: true,
        },
      });
      if (!priorContact) {
        return NextResponse.json(
          {
            error: 'BILLING_CONTACT_REQUIRED',
            message: 'Billing contact details are required for the first payment attempt',
          },
          { status: 422, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      contact = {
        firstName: priorContact.customerFirstName,
        lastName: priorContact.customerLastName,
        phoneLocal: priorContact.customerPhoneLocal,
        phoneCountryIso2: priorContact.customerPhoneCountryIso2,
      };
    }

    let chariow;
    try {
      chariow = getChariowClient();
    } catch (err) {
      if (err instanceof ChariowUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    // Supersede any still-open attempt for this subscription — reconcile it
    // first in case it already settled since the last check.
    const pending = await prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: subscription.id, status: 'PENDING' },
    });
    if (pending) {
      const result = await reconcilePayment(prisma, chariow, {
        id: pending.id,
        providerSaleId: pending.providerSaleId,
        subscriptionId: pending.subscriptionId,
      });
      if (result.outcome === 'succeeded') {
        return NextResponse.json(
          { id: pending.id, paymentUrl: null, status: 'SUCCEEDED' },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      await prisma.subscriptionPayment.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
    }

    const envPublicUrl = process.env.PUBLIC_URL;
    if (!envPublicUrl && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: 'PUBLIC_URL not set; cannot construct the Chariow redirect URL.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const publicUrl = envPublicUrl ?? 'http://localhost:3000';

    let checkout;
    try {
      checkout = await chariow.createCheckout({
        productId: subscription.plan.chariowProductId,
        email: auth.user.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phoneLocal: contact.phoneLocal,
        phoneCountryIso2: contact.phoneCountryIso2,
        redirectUrl: `${publicUrl}/facturation?chariow_return=1`,
        metadata: { organizationId, subscriptionId: subscription.id, planId: subscription.plan.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Chariow error';
      return NextResponse.json(
        { error: 'CHARIOW_CHECKOUT_FAILED', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const expiresAt = new Date(Date.now() + pendingExpireHours() * 60 * 60 * 1000);
    const payment = await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        organizationId,
        planId: subscription.plan.id,
        providerSaleId: checkout.purchaseId,
        checkoutUrl: checkout.checkoutUrl,
        status: 'PENDING',
        ...(checkout.amount
          ? { amount: checkout.amount.value, currency: checkout.amount.currency }
          : {}),
        customerEmail: auth.user.email,
        customerFirstName: contact.firstName,
        customerLastName: contact.lastName,
        customerPhoneLocal: contact.phoneLocal,
        customerPhoneCountryIso2: contact.phoneCountryIso2,
        expiresAt,
      },
    });

    return NextResponse.json(
      { id: payment.id, paymentUrl: payment.checkoutUrl, status: 'PENDING' },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
