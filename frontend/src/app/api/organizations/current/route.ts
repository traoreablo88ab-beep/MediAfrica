// POST /api/organizations/current — bootstraps a brand-new clinic for a
// signed-in user who has none yet. This is the missing half of Google OAuth
// signup: /api/auth/oauth/google/callback (protected, out of scope to edit)
// finds-or-creates a User but never creates an Organization the way
// /api/auth/signup does for email/password signups. A first-time Google
// sign-in therefore lands with `orgRole: null` — the frontend onboarding
// page (/onboarding-centre) calls this route once to catch up.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { getDefaultPlan } from '@/lib/server/subscriptions/default-plan';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const TRIAL_DAYS = 15;

const Body = z.object({
  clinicName: z.string().trim().min(1).max(200),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const existingMembership = await prisma.organizationMember.findUnique({
      where: { userId: auth.user.sub },
      select: { id: true },
    });
    if (existingMembership) {
      return NextResponse.json(
        {
          error: 'ALREADY_HAS_ORGANIZATION',
          message: 'This account is already linked to a health center.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
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
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { clinicName } = parsed.data;

    const defaultPlan = await getDefaultPlan(prisma);
    if (!defaultPlan) {
      return NextResponse.json(
        { error: 'SIGNUP_UNAVAILABLE', message: 'Signup is temporarily unavailable.' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const userId = auth.user.sub;

    // Resolve the slug via plain (non-transactional) existence checks before
    // opening the transaction below — see signup/route.ts for why retrying
    // `tx.organization.create` inside an interactive transaction is unsafe
    // (Postgres aborts the whole transaction on the first collision, so
    // every subsequent retry fails too, even against free slugs).
    const orgSlug = await ensureUniqueSlug(slugify(clinicName), async (candidate) => {
      const existing = await prisma.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (existing) {
        throw Object.assign(new Error('slug taken'), { code: 'P2002' });
      }
      return candidate;
    });

    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { slug: orgSlug, name: clinicName, ownerId: userId },
        select: { id: true },
      });
      const organizationId = org.id;

      await tx.organizationMember.create({
        data: { organizationId, userId, role: 'OWNER' },
      });

      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await tx.subscription.create({
        data: {
          organizationId,
          planId: defaultPlan.id,
          status: 'TRIALING',
          trialEndsAt,
          currentPeriodEnd: trialEndsAt,
        },
      });

      await tx.clinicSettings.create({
        data: { organizationId, name: clinicName },
      });
    });

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
