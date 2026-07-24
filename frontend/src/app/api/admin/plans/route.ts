// GET /api/admin/plans — list all subscription plans (active + archived).
// POST /api/admin/plans — create a new plan.
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const plans = await prisma.plan.findMany({
      orderBy: [{ isActive: 'desc' }, { priceAmount: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });

    return NextResponse.json(
      {
        items: plans.map((p) => ({
          id: p.id,
          name: p.name,
          priceAmount: p.priceAmount,
          currency: p.currency,
          billingIntervalDays: p.billingIntervalDays,
          isActive: p.isActive,
          subscriberCount: p._count.subscriptions,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreatePlanBody = z.object({
  name: z.string().trim().min(1).max(100),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string().length(3).default('XOF'),
  billingIntervalDays: z.number().int().positive().default(30),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreatePlanBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const plan = await prisma.plan.create({ data: parsed.data });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'plan.create',
      targetType: 'Plan',
      targetId: plan.id,
      metadata: { name: plan.name, priceAmount: plan.priceAmount, currency: plan.currency },
    });

    return NextResponse.json(
      { id: plan.id, name: plan.name, priceAmount: plan.priceAmount },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
