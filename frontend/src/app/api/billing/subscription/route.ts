// GET /api/billing/subscription — the caller's clinic subscription + plan,
// plus its recent payment history (for the /facturation page).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const HISTORY_LIMIT = 20;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: auth.orgMember.organizationId },
      include: { plan: true },
    });
    if (!subscription) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND', message: 'No subscription found for this clinic' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const payments = await prisma.subscriptionPayment.findMany({
      where: { organizationId: auth.orgMember.organizationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        checkoutUrl: true,
        succeededAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        },
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          priceAmount: subscription.plan.priceAmount,
          currency: subscription.plan.currency,
          billingIntervalDays: subscription.plan.billingIntervalDays,
        },
        history: payments.map((p) => ({
          id: p.id,
          amount: p.amount ?? subscription.plan.priceAmount,
          currency: p.currency ?? subscription.plan.currency,
          status: p.status,
          paymentUrl: p.checkoutUrl,
          paidAt: p.succeededAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
