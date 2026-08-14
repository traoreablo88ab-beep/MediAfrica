// POST /api/nutritions/[id]/visites — add one follow-up visite to a PCIMA
// record: daily for URENI, weekly for URENAS, every 1-2 weeks for URENAM.
// `numeroVisite` is computed inside a transaction and backstopped by
// `@@unique([nutritionId, numeroVisite])` on NutritionVisiteSuivi to avoid a
// race between two concurrent visite submissions. Gated by the closure of
// the parent record's own `date` (episode admission month) for the
// record's own type-specific register, same pattern as PATCH
// /api/nutritions/[id].
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

const CreateVisiteBody = z.object({
  date: z.coerce.date().optional(),
  poidsKg: z.number().positive().optional(),
  tailleCm: z.number().positive().optional(),
  perimetreBrachialCm: z.number().positive().optional(),
  ptIndice: z.string().trim().optional(),
  oedemes: z.enum(['Non', '+', '++', '+++']).optional(),
  type: z.string().trim().optional(),

  // Suivi clinique pragmatique
  testAppetit: z.enum(['Bon', 'Moyen', 'Faible']).optional(),
  diarrheeJours: z.number().int().min(0).optional(),
  vomissementJours: z.number().int().min(0).optional(),
  fievreJours: z.number().int().min(0).optional(),
  touxJours: z.number().int().min(0).optional(),
  temperatureC: z.number().positive().optional(),
  resultatTestPalu: z.enum(['0', '-', '+']).optional(),
  atpeSachets: z.number().int().min(0).optional(),
  dermatoses: z.string().trim().optional(),
  alerteLethargique: z.enum(['Alerte', 'Léthargique']).optional(),
  frequenceRespiratoireMin: z.number().int().min(0).optional(),
  seancesEducationNutritionnelle: z.number().int().min(0).optional(),
  seancesStimulation: z.number().int().min(0).optional(),
  observations: z.string().trim().optional(),
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

    const parsed = CreateVisiteBody.safeParse(await req.json().catch(() => null));
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

    const visite = await prisma.$transaction(async (tx) => {
      const last = await tx.nutritionVisiteSuivi.findFirst({
        where: { nutritionId },
        orderBy: { numeroVisite: 'desc' },
      });
      const numeroVisite = (last?.numeroVisite ?? 0) + 1;
      return tx.nutritionVisiteSuivi.create({
        data: {
          nutritionId,
          numeroVisite,
          ...(d.date ? { date: d.date } : {}),
          ...(d.poidsKg !== undefined ? { poidsKg: d.poidsKg } : {}),
          ...(d.tailleCm !== undefined ? { tailleCm: d.tailleCm } : {}),
          ...(d.perimetreBrachialCm !== undefined
            ? { perimetreBrachialCm: d.perimetreBrachialCm }
            : {}),
          ...(d.ptIndice ? { ptIndice: d.ptIndice } : {}),
          ...(d.oedemes ? { oedemes: d.oedemes } : {}),
          ...(d.type ? { type: d.type } : {}),
          ...(d.testAppetit ? { testAppetit: d.testAppetit } : {}),
          ...(d.diarrheeJours !== undefined ? { diarrheeJours: d.diarrheeJours } : {}),
          ...(d.vomissementJours !== undefined ? { vomissementJours: d.vomissementJours } : {}),
          ...(d.fievreJours !== undefined ? { fievreJours: d.fievreJours } : {}),
          ...(d.touxJours !== undefined ? { touxJours: d.touxJours } : {}),
          ...(d.temperatureC !== undefined ? { temperatureC: d.temperatureC } : {}),
          ...(d.resultatTestPalu ? { resultatTestPalu: d.resultatTestPalu } : {}),
          ...(d.atpeSachets !== undefined ? { atpeSachets: d.atpeSachets } : {}),
          ...(d.dermatoses ? { dermatoses: d.dermatoses } : {}),
          ...(d.alerteLethargique ? { alerteLethargique: d.alerteLethargique } : {}),
          ...(d.frequenceRespiratoireMin !== undefined
            ? { frequenceRespiratoireMin: d.frequenceRespiratoireMin }
            : {}),
          ...(d.seancesEducationNutritionnelle !== undefined
            ? { seancesEducationNutritionnelle: d.seancesEducationNutritionnelle }
            : {}),
          ...(d.seancesStimulation !== undefined
            ? { seancesStimulation: d.seancesStimulation }
            : {}),
          ...(d.observations ? { observations: d.observations } : {}),
        },
      });
    });

    return NextResponse.json(
      {
        id: visite.id,
        nutritionId: visite.nutritionId,
        numeroVisite: visite.numeroVisite,
        date: visite.date.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
