// PATCH /api/admin/organizations/[id]/members/[userId] — platform SUPERADMIN
// changes a clinic member's org role (MEMBER/ADMIN/OWNER). Lets the
// platform step in and designate/consolidate a clinic's manager without
// needing the clinic's own OWNER to do it via Personnel. SUPERADMIN-only
// (not ADMIN) — this grants/revokes ownership of an entire clinic's data,
// same severity class as a platform role change.
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

const Body = z.object({
  role: z.enum(['MEMBER', 'ADMIN', 'OWNER']),
});

type Discriminator =
  | { kind: 'NOT_FOUND' }
  | { kind: 'LAST_OWNER' }
  | { kind: 'OK'; from: string; role: string };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; userId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id: organizationId, userId } = await ctx.params;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };

      if (target.role === 'OWNER' && parsed.data.role !== 'OWNER') {
        const ownerCount = await tx.organizationMember.count({
          where: { organizationId, role: 'OWNER' },
        });
        if (ownerCount <= 1) {
          return { kind: 'LAST_OWNER' as const };
        }
      }

      await tx.organizationMember.update({
        where: { organizationId_userId: { organizationId, userId } },
        data: { role: parsed.data.role },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'organization.member_role_change',
        targetType: 'OrganizationMember',
        targetId: userId,
        metadata: { organizationId, from: target.role, to: parsed.data.role },
      });

      return { kind: 'OK' as const, from: target.role, role: parsed.data.role };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'MEMBER_NOT_FOUND', message: 'Member not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'LAST_OWNER') {
      return NextResponse.json(
        { error: 'LAST_OWNER', message: 'Refuse to demote the last owner.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { userId, role: result.role },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
