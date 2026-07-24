// GET /api/admin/organizations/[id] — full detail for one clinic: owner,
// members, subscription/plan, patient count. Uses requireAdminOrgAccess
// (not requireOrgMember) — the platform admin explicitly names the clinic
// they're inspecting, never implicitly "belongs" to one.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminOrgAccess } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { id } = await ctx.params;

    const auth = await requireAdminOrgAccess(id);
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        subscription: { include: { plan: true } },
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { patients: true } },
      },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      {
        id: org.id,
        slug: org.slug,
        name: org.name,
        owner: org.owner,
        patientCount: org._count.patients,
        createdAt: org.createdAt.toISOString(),
        members: org.members.map((m) => ({
          id: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
        })),
        subscription: org.subscription
          ? {
              id: org.subscription.id,
              status: org.subscription.status,
              trialEndsAt: org.subscription.trialEndsAt?.toISOString() ?? null,
              currentPeriodEnd: org.subscription.currentPeriodEnd.toISOString(),
              plan: {
                id: org.subscription.plan.id,
                name: org.subscription.plan.name,
                priceAmount: org.subscription.plan.priceAmount,
                currency: org.subscription.plan.currency,
              },
            }
          : null,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
