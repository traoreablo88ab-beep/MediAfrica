// GET /api/admin/reports — platform admin list of staff-submitted comments
// on the application (rated 1-5, tagged by feature area), filterable by
// status (internal triage: OPEN = not yet replied to, RESOLVED = replied /
// acknowledged).
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
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.ReportWhereInput = {
      ...(status ? { status } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        organization: { select: { id: true, name: true } },
        reporter: { select: { email: true, name: true } },
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        items: page.items.map((r) => ({
          id: r.id,
          organizationId: r.organization.id,
          organizationName: r.organization.name,
          reporterEmail: r.reporter.email,
          reporterName: r.reporter.name,
          category: r.category,
          message: r.message,
          rating: r.rating,
          status: r.status,
          adminResponse: r.adminResponse,
          adminRespondedAt: r.adminRespondedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
