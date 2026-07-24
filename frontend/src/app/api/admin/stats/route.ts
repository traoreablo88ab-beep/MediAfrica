// GET /api/admin/stats — platform-wide aggregate KPIs for the admin
// "Vue d'ensemble" dashboard: clinic count, real MRR (sum of ACTIVE
// subscriptions' plan price), total staff, consultations this month, and a
// 6-month paid-revenue trend. All live aggregate queries — no placeholders.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const TREND_MONTHS = 6;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const monthStart = startOfMonth(now);
    const trendStart = new Date(monthStart);
    trendStart.setMonth(trendStart.getMonth() - (TREND_MONTHS - 1));

    const [
      organizationCount,
      staffCount,
      consultationsThisMonth,
      activeSubscriptions,
      newOrganizations,
      paidOrdersForTrend,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organizationMember.count(),
      prisma.consultation.count({ where: { date: { gte: monthStart } } }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        select: { plan: { select: { priceAmount: true, currency: true } } },
      }),
      prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { status: 'PAID', subscriptionId: { not: null }, paidAt: { gte: trendStart } },
        select: { amount: true, paidAt: true },
      }),
    ]);

    const mrr = activeSubscriptions.reduce((sum, s) => sum + s.plan.priceAmount, 0);
    const mrrCurrency = activeSubscriptions[0]?.plan.currency ?? 'XOF';

    const trend: { month: string; total: number }[] = [];
    for (let i = 0; i < TREND_MONTHS; i++) {
      const m = new Date(trendStart);
      m.setMonth(m.getMonth() + i);
      trend.push({ month: m.toISOString().slice(0, 7), total: 0 });
    }
    for (const o of paidOrdersForTrend) {
      if (!o.paidAt) continue;
      const key = o.paidAt.toISOString().slice(0, 7);
      const bucket = trend.find((t) => t.month === key);
      if (bucket) bucket.total += o.amount;
    }

    return NextResponse.json(
      {
        organizationCount,
        staffCount,
        consultationsThisMonth,
        mrr,
        mrrCurrency,
        revenueTrend: trend,
        newOrganizations: newOrganizations.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          createdAt: o.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
