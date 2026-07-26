// GET /api/registres/maternite/cpn/closure?month=2026-01 — closure status
// for a given month (default: current month) of the CPN register. Any
// authenticated staff member can read this (used to show the "Clôturé"
// badge / gate the close button).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { monthKey } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'maternite-cpn';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const monthParam = req.nextUrl.searchParams.get('month');
    const month = monthParam ?? monthKey(new Date());

    const closure = await prisma.registerClosure.findUnique({
      where: {
        organizationId_registerType_month: {
          organizationId: auth.orgMember.organizationId,
          registerType: REGISTER_TYPE,
          month,
        },
      },
      include: { closedBy: { select: { name: true, email: true } } },
    });

    return NextResponse.json(
      {
        month,
        closed: closure !== null,
        closedAt: closure?.closedAt.toISOString() ?? null,
        closedByName: closure?.closedBy?.name ?? closure?.closedBy?.email ?? null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
