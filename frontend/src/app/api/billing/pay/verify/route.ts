// POST /api/billing/pay/verify — polled by /facturation after the browser
// returns from Chariow's hosted checkout page. Chariow's redirect_url does
// NOT distinguish success/failure via query params, so this route never
// concludes from anything the client sends — it always re-pulls the real
// status from Chariow via reconcilePayment() (or returns the last known
// state if Chariow is unconfigured / nothing to reconcile).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  getChariowClient,
  ChariowUnconfiguredError,
} from '@/lib/server/subscriptions/chariow-singleton';
import { reconcilePayment } from '@/lib/server/subscriptions/reconcile';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: auth.orgMember.organizationId },
    });
    if (!subscription) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND', message: 'No subscription found for this clinic' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const latest = await prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return NextResponse.json({ status: 'NONE' }, { headers: { 'x-request-id': ctx.requestId } });
    }

    if (latest.status === 'PENDING') {
      try {
        const chariow = getChariowClient();
        await reconcilePayment(prisma, chariow, {
          id: latest.id,
          providerSaleId: latest.providerSaleId,
          subscriptionId: latest.subscriptionId,
        });
      } catch (err) {
        if (!(err instanceof ChariowUnconfiguredError)) throw err;
      }
    }

    const [freshPayment, freshSubscription] = await Promise.all([
      prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: latest.id } }),
      prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } }),
    ]);

    return NextResponse.json(
      {
        status: freshPayment.status,
        subscription: {
          status: freshSubscription.status,
          currentPeriodEnd: freshSubscription.currentPeriodEnd.toISOString(),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
