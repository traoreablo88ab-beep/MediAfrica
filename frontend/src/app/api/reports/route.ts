// POST /api/reports — any clinic staff member files a report (bug, support
// request, billing issue…). Reviewed by the platform admin under
// /admin/signalements.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateReportBody = z.object({
  category: z.enum(['bug', 'support', 'billing', 'autre']),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const parsed = CreateReportBody.safeParse(await req.json().catch(() => null));
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

    const report = await prisma.report.create({
      data: {
        organizationId: auth.orgMember.organizationId,
        reporterId: auth.user.sub,
        category: parsed.data.category,
        message: parsed.data.message,
      },
    });

    return NextResponse.json(
      { id: report.id, status: report.status },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
