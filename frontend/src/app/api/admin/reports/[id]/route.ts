// PATCH /api/admin/reports/[id] — the platform admin replies to a staff
// comment and/or marks it OPEN/RESOLVED (internal triage only — the staff
// side never sees a ticket-style status, only `adminResponse` once set).
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

const PatchReportBody = z
  .object({
    status: z.enum(['OPEN', 'RESOLVED']).optional(),
    adminResponse: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.adminResponse !== undefined, {
    message: 'Provide at least one of status or adminResponse',
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

    const { status, adminResponse } = parsed.data;
    const updated = await prisma.report.update({
      where: { id },
      data: {
        ...(status !== undefined
          ? { status, resolvedAt: status === 'RESOLVED' ? new Date() : null }
          : {}),
        ...(adminResponse !== undefined ? { adminResponse, adminRespondedAt: new Date() } : {}),
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: adminResponse !== undefined ? 'report.reply' : 'report.status_update',
      targetType: 'Report',
      targetId: id,
      metadata: {
        ...(status !== undefined ? { statusFrom: existing.status, statusTo: updated.status } : {}),
        ...(adminResponse !== undefined ? { replied: true } : {}),
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        status: updated.status,
        adminResponse: updated.adminResponse,
        adminRespondedAt: updated.adminRespondedAt?.toISOString() ?? null,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
