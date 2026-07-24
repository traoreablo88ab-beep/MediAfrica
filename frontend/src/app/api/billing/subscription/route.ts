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

    const orders = await prisma.order.findMany({
      where: { organizationId: auth.orgMember.organizationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paymentUrl: true,
        paidAt: true,
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
        history: orders.map((o) => ({
          id: o.id,
          amount: o.amount,
          currency: o.currency,
          status: o.status,
          paymentUrl: o.paymentUrl,
          paidAt: o.paidAt?.toISOString() ?? null,
          createdAt: o.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
