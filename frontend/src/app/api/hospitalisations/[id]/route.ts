// PATCH /api/hospitalisations/[id] — record the discharge (or correct any
// field) of an existing hospitalisation. This is what makes Hospitalisation
// different from Consultation/Maternite/Nutrition/Vaccination: the fiche is
// opened at admission and completed later, once the outcome is known.
// Gated by the closure of the ADMISSION's month (existing.dateHeureEntree),
// same pattern as PATCH /api/consultations/[id] — a single hospitalisation
// register covers every service.
// DELETE /api/hospitalisations/[id] — removes a wrongly-created admission
// (wrong patient selected, duplicate entry). Same month-closure guard.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'hospitalisation';

const PatchHospitalisationBody = z.object({
  dateHeureSortie: z.coerce.date().optional(),
  issue: z
    .enum([
      'Sortie médicale',
      'Référé vers autre structure',
      'Décédé',
      'Transféré vers autre service',
      'Abandon',
    ])
    .optional(),
  causeDeces: z.string().trim().optional(),
  structureReference: z.string().trim().optional(),
  traitementRecu: z.string().trim().optional(),
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

    const parsed = PatchHospitalisationBody.safeParse(await req.json().catch(() => null));
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

    const existing = await prisma.hospitalisation.findFirst({
      where: { id, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'HOSPITALISATION_NOT_FOUND', message: 'Hospitalisation not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (
      await isMonthClosed(
        prisma,
        auth.orgMember.organizationId,
        REGISTER_TYPE,
        existing.dateHeureEntree,
      )
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The hospitalisation register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const d = parsed.data;

    const updated = await prisma.hospitalisation.update({
      where: { id },
      data: {
        ...(d.dateHeureSortie !== undefined ? { dateHeureSortie: d.dateHeureSortie } : {}),
        ...(d.issue ? { issue: d.issue } : {}),
        ...(d.causeDeces ? { causeDeces: d.causeDeces } : {}),
        ...(d.structureReference ? { structureReference: d.structureReference } : {}),
        ...(d.traitementRecu ? { traitementRecu: d.traitementRecu } : {}),
        ...(d.observations ? { observations: d.observations } : {}),
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        dateHeureSortie: updated.dateHeureSortie?.toISOString() ?? null,
        issue: updated.issue,
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

    const existing = await prisma.hospitalisation.findFirst({
      where: { id, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'HOSPITALISATION_NOT_FOUND', message: 'Hospitalisation not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (
      await isMonthClosed(
        prisma,
        auth.orgMember.organizationId,
        REGISTER_TYPE,
        existing.dateHeureEntree,
      )
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The hospitalisation register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.hospitalisation.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
