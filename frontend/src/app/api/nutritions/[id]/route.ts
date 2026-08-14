// PATCH /api/nutritions/[id] — record the sortie/issue of an existing PCIMA
// record. For URENI/URENAS this is the discharge (anthropometry at exit,
// type de sortie, poids minimum, séances). For URENAM this is the episode's
// final outcome (type de sortie/perdu, poudre nutritive, plaquette, durée
// de séjour) — follow-up visites themselves are added via POST
// /api/nutritions/[id]/visites, not through this endpoint. Gated by the
// closure of the record's own `date` (admission/creation month), same
// pattern as PATCH /api/hospitalisations/[id].
// DELETE /api/nutritions/[id] — removes a wrongly-created record. Same
// month-closure guard.
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

const PatchNutritionBody = z.object({
  dateSortie: z.coerce.date().optional(),
  poidsSortieKg: z.number().positive().optional(),
  tailleSortieCm: z.number().positive().optional(),
  perimetreBrachialSortieCm: z.number().positive().optional(),
  ptIndiceSortie: z.string().trim().optional(),
  oedemeSortie: z.enum(['Non', '+', '++', '+++']).optional(),
  typeSortie: z
    .enum(['Guéri', 'Décès', 'Abandon', 'Non répondant', 'Transféré/référé', 'Perdu de vue'])
    .optional(),
  destinationProgramme: z.enum(['URENI', 'URENAS', 'URENAM', 'Autre structure']).optional(),
  datePoidsMinimum: z.coerce.date().optional(),
  poidsMinimumKg: z.number().positive().optional(),
  seancesStimulationPsychocognitive: z.number().int().min(0).optional(),
  seancesCcsc: z.number().int().min(0).optional(),
  beneficiairePoudreNutritive: z.boolean().optional(),
  beneficiairePlaquette: z.boolean().optional(),
  dureeSejourJours: z.number().int().min(0).optional(),
  observations: z.string().trim().optional(),
});

export async function PATCH(
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

    const { id } = await ctx.params;

    const parsed = PatchNutritionBody.safeParse(await req.json().catch(() => null));
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

    const existing = await prisma.nutrition.findFirst({
      where: { id, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NUTRITION_NOT_FOUND', message: 'Nutrition record not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const registerType = REGISTER_TYPE_BY_NUTRITION_TYPE[existing.type];
    if (
      registerType &&
      (await isMonthClosed(prisma, auth.orgMember.organizationId, registerType, existing.date))
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

    const updated = await prisma.nutrition.update({
      where: { id },
      data: {
        ...(d.dateSortie !== undefined ? { dateSortie: d.dateSortie } : {}),
        ...(d.poidsSortieKg !== undefined ? { poidsSortieKg: d.poidsSortieKg } : {}),
        ...(d.tailleSortieCm !== undefined ? { tailleSortieCm: d.tailleSortieCm } : {}),
        ...(d.perimetreBrachialSortieCm !== undefined
          ? { perimetreBrachialSortieCm: d.perimetreBrachialSortieCm }
          : {}),
        ...(d.ptIndiceSortie ? { ptIndiceSortie: d.ptIndiceSortie } : {}),
        ...(d.oedemeSortie ? { oedemeSortie: d.oedemeSortie } : {}),
        ...(d.typeSortie ? { typeSortie: d.typeSortie } : {}),
        ...(d.destinationProgramme ? { destinationProgramme: d.destinationProgramme } : {}),
        ...(d.datePoidsMinimum !== undefined ? { datePoidsMinimum: d.datePoidsMinimum } : {}),
        ...(d.poidsMinimumKg !== undefined ? { poidsMinimumKg: d.poidsMinimumKg } : {}),
        ...(d.seancesStimulationPsychocognitive !== undefined
          ? { seancesStimulationPsychocognitive: d.seancesStimulationPsychocognitive }
          : {}),
        ...(d.seancesCcsc !== undefined ? { seancesCcsc: d.seancesCcsc } : {}),
        ...(d.beneficiairePoudreNutritive !== undefined
          ? { beneficiairePoudreNutritive: d.beneficiairePoudreNutritive }
          : {}),
        ...(d.beneficiairePlaquette !== undefined
          ? { beneficiairePlaquette: d.beneficiairePlaquette }
          : {}),
        ...(d.dureeSejourJours !== undefined ? { dureeSejourJours: d.dureeSejourJours } : {}),
        ...(d.observations ? { observations: d.observations } : {}),
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        dateSortie: updated.dateSortie?.toISOString() ?? null,
        typeSortie: updated.typeSortie,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
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

    const { id } = await ctx.params;

    const existing = await prisma.nutrition.findFirst({
      where: { id, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NUTRITION_NOT_FOUND', message: 'Nutrition record not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const registerType = REGISTER_TYPE_BY_NUTRITION_TYPE[existing.type];
    if (
      registerType &&
      (await isMonthClosed(prisma, auth.orgMember.organizationId, registerType, existing.date))
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.nutrition.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
