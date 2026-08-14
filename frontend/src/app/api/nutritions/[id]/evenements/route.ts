// POST /api/nutritions/[id]/evenements — add a VAD (visite à domicile) or
// référence/transfert entry to a URENAS record. Repeatable, ordered by
// date, no auto-increment (unlike visites, which need a stable
// numeroVisite). Gated by the closure of the parent record's own `date`
// (episode admission month) for the record's own type-specific register,
// same pattern as POST /api/nutritions/[id]/visites.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, REGISTER_TYPE_BY_NUTRITION_TYPE } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateEvenementBody = z.object({
  type: z.enum(['VAD', 'REFERENCE_TRANSFERT']),
  date: z.coerce.date().optional(),
  raison: z.string().trim().optional(),
  conclusion: z.string().trim().optional(),
  centre: z.string().trim().optional(),
  resultat: z.string().trim().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
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

    const { id: nutritionId } = await ctx.params;

    const parsed = CreateEvenementBody.safeParse(await req.json().catch(() => null));
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

    const nutrition = await prisma.nutrition.findFirst({
      where: { id: nutritionId, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!nutrition) {
      return NextResponse.json(
        { error: 'NUTRITION_NOT_FOUND', message: 'Nutrition record not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (nutrition.type !== 'URENAS') {
      return NextResponse.json(
        {
          error: 'INVALID_NUTRITION_TYPE',
          message: 'Only URENAS records track VAD/référence-transfert events.',
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const registerType = REGISTER_TYPE_BY_NUTRITION_TYPE[nutrition.type];
    if (
      registerType &&
      (await isMonthClosed(prisma, auth.orgMember.organizationId, registerType, nutrition.date))
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const d = parsed.data;

    const evenement = await prisma.nutritionEvenement.create({
      data: {
        nutritionId,
        type: d.type,
        ...(d.date ? { date: d.date } : {}),
        ...(d.raison ? { raison: d.raison } : {}),
        ...(d.conclusion ? { conclusion: d.conclusion } : {}),
        ...(d.centre ? { centre: d.centre } : {}),
        ...(d.resultat ? { resultat: d.resultat } : {}),
      },
    });

    return NextResponse.json(
      {
        id: evenement.id,
        nutritionId: evenement.nutritionId,
        type: evenement.type,
        date: evenement.date.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
