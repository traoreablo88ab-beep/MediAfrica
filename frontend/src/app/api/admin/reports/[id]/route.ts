// PATCH /api/admin/reports/[id] — mark a report OPEN/RESOLVED.
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

const PatchReportBody = z.object({
  status: z.enum(['OPEN', 'RESOLVED']),
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

    const parsed = PatchReportBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.report.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'REPORT_NOT_FOUND', message: 'Report not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.report.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === 'RESOLVED' ? new Date() : null,
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'report.status_update',
      targetType: 'Report',
      targetId: id,
      metadata: { from: existing.status, to: updated.status },
    });

    return NextResponse.json(
      { id: updated.id, status: updated.status },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
