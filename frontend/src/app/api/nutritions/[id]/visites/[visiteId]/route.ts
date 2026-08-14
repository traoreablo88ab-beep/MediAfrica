// DELETE /api/nutritions/[id]/visites/[visiteId] — removes a wrongly-dated
// or duplicate follow-up visite. Same org-scoping (transitively via
// nutrition -> patient) and month-closure guard (on the parent record's
// `date`, checked against the record's own type-specific register) as the
// other nutrition mutation routes.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, REGISTER_TYPE_BY_NUTRITION_TYPE } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; visiteId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', reqCtx.requestId);
      return subFail;
    }

    const { id: nutritionId, visiteId } = await ctx.params;

    const visite = await prisma.nutritionVisiteSuivi.findFirst({
      where: {
        id: visiteId,
        nutritionId,
        nutrition: { patient: { organizationId: auth.orgMember.organizationId } },
      },
      include: { nutrition: { select: { date: true, type: true } } },
    });
    if (!visite) {
      return NextResponse.json(
        { error: 'VISITE_NOT_FOUND', message: 'Visite not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const registerType = REGISTER_TYPE_BY_NUTRITION_TYPE[visite.nutrition.type];
    if (
      registerType &&
      (await isMonthClosed(
        prisma,
        auth.orgMember.organizationId,
        registerType,
        visite.nutrition.date,
      ))
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.nutritionVisiteSuivi.delete({ where: { id: visiteId } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
