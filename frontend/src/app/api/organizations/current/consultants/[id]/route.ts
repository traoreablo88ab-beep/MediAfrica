// PATCH /api/organizations/current/consultants/[id] — OWNER/ADMIN resets a
// consultant's password directly (no email flow exists for these accounts,
// so a forgotten password can only be fixed by the clinic admin).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, hashPassword } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { isConsultantEmail } from '@/lib/consultantAuth';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const PatchBody = z.object({ password: z.string().min(1) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
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
    if (parsed.data.password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Same-org + synthetic-email guard: this endpoint can only ever touch an
    // identifiant-based consultant account it created, never a real staff
    // member's own email/password (that's self-service via /reset-password).
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: auth.orgMember.organizationId, userId: id },
      },
      include: { user: { select: { email: true } } },
    });
    if (!membership || !isConsultantEmail(membership.user.email)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Consultant not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
