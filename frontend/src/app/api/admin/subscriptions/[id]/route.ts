// PATCH /api/admin/subscriptions/[id] — manual override: change a clinic's
// plan and/or subscription status (e.g. reactivate after an off-platform
// payment, or force-cancel). Not the normal renewal path (that's the
// subscription-billing cron + /api/billing/pay) — this is the admin escape
// hatch for support cases.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchSubscriptionBody = z.object({
  planId: z.string().optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;

    const parsed = PatchSubscriptionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (parsed.data.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
      if (!plan) {
        return NextResponse.json(
          { error: 'PLAN_NOT_FOUND', message: 'Plan not found' },
          { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const d = parsed.data;
    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        ...(d.planId !== undefined ? { planId: d.planId } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'subscription.update',
      targetType: 'Subscription',
      targetId: id,
      metadata: {
        from: { planId: existing.planId, status: existing.status },
        to: { planId: updated.planId, status: updated.status },
      },
    });

    return NextResponse.json(
      { id: updated.id, planId: updated.planId, status: updated.status },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
