// GET /api/admin/subscriptions — every clinic's subscription, filterable
// by status (e.g. ?status=PAST_DUE for collections follow-up).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const organizationId = url.searchParams.get('organizationId');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.SubscriptionWhereInput = {
      ...(status ? { status } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.subscription.findMany({
      where,
      orderBy: [{ currentPeriodEnd: 'asc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        organization: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, priceAmount: true, currency: true } },
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        items: page.items.map((s) => ({
          id: s.id,
          organizationId: s.organization.id,
          organizationName: s.organization.name,
          status: s.status,
          trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: s.currentPeriodEnd.toISOString(),
          plan: s.plan,
        })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
