// GET /api/reports — the caller's own clinic's comments (any staff member
// can see what their colleagues have submitted, scoped to their own
// organization only — not the platform-wide view at /admin/signalements).
// POST /api/reports — any clinic staff member leaves a comment on the
// application itself (an optional 1-5 rating + a feature area + free text).
// Reviewed by the platform admin under /admin/signalements, who can reply —
// the reply flows back here as `adminResponse`.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateReportBody = z.object({
  category: z.enum([
    'general',
    'patients',
    'consultations',
    'registres',
    'personnel',
    'facturation',
    'autre',
  ]),
  message: z.string().trim().min(1).max(2000),
  rating: z.number().int().min(1).max(5).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.ReportWhereInput = {
      organizationId: auth.orgMember.organizationId,
      ...cursorWhere(cursor),
    };

    const rows = await prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { reporter: { select: { email: true, name: true } } },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        items: page.items.map((r) => ({
          id: r.id,
          reporterEmail: r.reporter.email,
          reporterName: r.reporter.name,
          category: r.category,
          message: r.message,
          rating: r.rating,
          adminResponse: r.adminResponse,
          adminRespondedAt: r.adminRespondedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

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
        rating: parsed.data.rating ?? null,
      },
    });

    return NextResponse.json(
      { id: report.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
