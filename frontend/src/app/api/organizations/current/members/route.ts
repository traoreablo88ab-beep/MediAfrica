// GET /api/organizations/current/members — list the caller's clinic staff.
//
// POST /api/organizations/current/members — OWNER/ADMIN invites a new staff
// member: creates a pre-verified User (no password yet, emailVerifiedAt set
// immediately since they're vouched for by a known org admin) + a MEMBER/
// ADMIN OrganizationMember row, then issues a PASSWORD_RESET verification
// code via the SHARED helper (issuePasswordReset) — deliberately NOT the
// anonymous /api/auth/forgot-password route, whose rate limit and timing
// floor target a different threat model (see issue-password-reset.ts).
// The invitee lands on the already-built /reset-password page to set their
// password and log in for the first time.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { issuePasswordReset } from '@/lib/server/auth/issue-password-reset';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

// Per-organization bucket (not per-invitee-email) — an inviting clinic
// shouldn't be able to fire unlimited invite emails, but this is a
// different threat model than the anonymous auth:forgot bucket.
const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'org:invite',
  windowMs: 60 * 60 * 1000,
  max: 20,
  code: 'TOO_MANY_INVITES',
  message: 'Too many staff invitations. Try again later.',
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: auth.orgMember.organizationId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
    });

    return NextResponse.json(
      {
        items: members.map((m) => ({
          id: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          createdAt: m.user.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const InviteBody = z.object({
  email: zEmail,
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const rateFail = await limiter.check(req, auth.orgMember.organizationId);
    if (rateFail) return rateFail;

    const parsed = InviteBody.safeParse(await req.json().catch(() => null));
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
    const { email, role } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, emailVerifiedAt: new Date() },
        select: { id: true },
      });
      await tx.organizationMember.create({
        data: { organizationId: auth.orgMember.organizationId, userId: user.id, role },
      });
      await issuePasswordReset(tx, { userId: user.id, email });
    });

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
