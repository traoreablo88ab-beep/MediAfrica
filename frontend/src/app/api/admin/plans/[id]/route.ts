// PATCH /api/admin/plans/[id] — edit a plan's price/name/interval/active
// state. Forward-only: existing subscribers keep their current
// Subscription.currentPeriodEnd unchanged, so a price change only affects
// what they're charged at their NEXT renewal (subscription-billing cron
// reads Plan.priceAmount fresh each period) — never retroactive.
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

const PatchPlanBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  priceAmount: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  billingIntervalDays: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
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

    const parsed = PatchPlanBody.safeParse(await req.json().catch(() => null));
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

    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Plan not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const d = parsed.data;
    const updated = await prisma.plan.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.priceAmount !== undefined ? { priceAmount: d.priceAmount } : {}),
        ...(d.currency !== undefined ? { currency: d.currency } : {}),
        ...(d.billingIntervalDays !== undefined
          ? { billingIntervalDays: d.billingIntervalDays }
          : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'plan.update',
      targetType: 'Plan',
      targetId: id,
      metadata: {
        from: { priceAmount: existing.priceAmount, isActive: existing.isActive },
        to: { priceAmount: updated.priceAmount, isActive: updated.isActive },
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        name: updated.name,
        priceAmount: updated.priceAmount,
        currency: updated.currency,
        billingIntervalDays: updated.billingIntervalDays,
        isActive: updated.isActive,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
