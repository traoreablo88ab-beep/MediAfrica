// GET /api/organizations/current/consultants — list the caller's clinic
// consultant accounts (staff logging in via identifiant, not email).
//
// POST /api/organizations/current/consultants — OWNER/ADMIN grants a new
// consultant access directly: picks an identifiant + password on their
// behalf (no invite email — many consultants don't have one). The account
// is created pre-verified, using a synthetic email under a fixed domain so
// the normal email+password login route works unmodified.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, hashPassword } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { identifiantToEmail, IDENTIFIANT_REGEX } from '@/lib/consultantAuth';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

// Per-organization bucket — an org admin shouldn't be able to mint unlimited
// consultant accounts in a burst; separate bucket from `org:invite` since
// this is a different action with no email delivery to throttle.
const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'org:consultant',
  windowMs: 60 * 60 * 1000,
  max: 30,
  code: 'TOO_MANY_CONSULTANTS',
  message: 'Too many consultant accounts created. Try again later.',
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId: auth.orgMember.organizationId,
        user: { email: { endsWith: '@consultant.mediafrica.local' } },
      },
      orderBy: { createdAt: 'desc' },
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

const CreateBody = z.object({
  name: z.string().trim().min(1).max(100),
  identifiant: z
    .string()
    .trim()
    .toLowerCase()
    .regex(IDENTIFIANT_REGEX, 'Identifiant invalide (3-32 caractères, lettres/chiffres/.-_)'),
  password: z.string().min(1),
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

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
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
    const { name, identifiant, password } = parsed.data;

    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const email = identifiantToEmail(identifiant);
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'IDENTIFIANT_TAKEN', message: 'This identifiant is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash, emailVerifiedAt: new Date() },
        select: { id: true },
      });
      await tx.organizationMember.create({
        data: { organizationId: auth.orgMember.organizationId, userId: user.id, role: 'MEMBER' },
      });
    });

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
