// PATCH /api/organizations/current/members/[userId] — clinic OWNER changes
// an existing member's role (MEMBER/ADMIN/OWNER). Complements
// /api/organizations/current/members POST (invite), which only sets a role
// at invite time and has no way to change it afterward. OWNER-only, mirrors
// the "only SUPERADMIN changes platform roles" precedent — an ADMIN member
// cannot promote themselves or others further.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  role: z.enum(['MEMBER', 'ADMIN', 'OWNER']),
});

type Discriminator = { kind: 'NOT_FOUND' } | { kind: 'LAST_OWNER' } | { kind: 'OK'; role: string };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.OWNER) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Only the clinic owner can change roles.' },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { userId } = await ctx.params;
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

    const organizationId = auth.orgMember.organizationId;

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };

      // Same COUNT+UPDATE-in-tx pattern as the platform last-SUPERADMIN
      // guard — an org must always keep at least one OWNER.
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

      return { kind: 'OK' as const, role: parsed.data.role };
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
