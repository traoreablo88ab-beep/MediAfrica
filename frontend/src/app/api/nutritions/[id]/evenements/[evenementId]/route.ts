// DELETE /api/nutritions/[id]/evenements/[evenementId] — removes a
// wrongly-dated or duplicate VAD/référence-transfert entry. Same
// org-scoping (transitively via nutrition -> patient) and month-closure
// guard (on the parent record's `date`) as
// DELETE /api/nutritions/[id]/visites/[visiteId]. No type re-check here —
// the type was already validated at creation.
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
  ctx: { params: Promise<{ id: string; evenementId: string }> },
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

    const { id: nutritionId, evenementId } = await ctx.params;

    const evenement = await prisma.nutritionEvenement.findFirst({
      where: {
        id: evenementId,
        nutritionId,
        nutrition: { patient: { organizationId: auth.orgMember.organizationId } },
      },
      include: { nutrition: { select: { date: true, type: true } } },
    });
    if (!evenement) {
      return NextResponse.json(
        { error: 'EVENEMENT_NOT_FOUND', message: 'Évènement not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const registerType = REGISTER_TYPE_BY_NUTRITION_TYPE[evenement.nutrition.type];
    if (
      registerType &&
      (await isMonthClosed(
        prisma,
        auth.orgMember.organizationId,
        registerType,
        evenement.nutrition.date,
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

    await prisma.nutritionEvenement.delete({ where: { id: evenementId } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
