// GET /api/admin/organizations — platform admin list of every clinic
// tenant, with member/patient counts and subscription status. Mirrors the
// admin/users list-pattern (clampLimit/cursorWhere/buildPage/decodeCursor).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.OrganizationWhereInput = {
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        owner: { select: { email: true, name: true } },
        subscription: { include: { plan: { select: { name: true, priceAmount: true } } } },
        _count: { select: { members: true, patients: true } },
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        items: page.items.map((org) => ({
          id: org.id,
          slug: org.slug,
          name: org.name,
          ownerEmail: org.owner.email,
          ownerName: org.owner.name,
          memberCount: org._count.members,
          patientCount: org._count.patients,
          subscription: org.subscription
            ? {
                status: org.subscription.status,
                planName: org.subscription.plan.name,
                planPriceAmount: org.subscription.plan.priceAmount,
                currentPeriodEnd: org.subscription.currentPeriodEnd.toISOString(),
              }
            : null,
          createdAt: org.createdAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
