// POST /api/patients/[id]/nutrition — log a nutrition screening/follow-up
// visit for a patient (protocole PCIMA — URENAM/URENI). providerId is always
// the authenticated staff member (auth.user.sub), never client-supplied.
// There is no PATCH/DELETE — a nutrition record is immuable once created,
// same as Maternite. Refuses with REGISTER_CLOSED once the current month's
// nutrition register has been closed (frontend/src/lib/server/registers/closure.ts).
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

const REGISTER_TYPE = 'nutrition';

const CreateNutritionBody = z.object({
  typeCas: z.enum(['NC', 'AC']).optional(),

  poidsKg: z.number().positive().optional(),
  tailleCm: z.number().positive().optional(),
  perimetreBrachialCm: z.number().positive().optional(),
  oedemes: z.enum(['Non', '+', '++', '+++']).optional(),
  statutPT: z.string().trim().optional(),
  classification: z
    .enum(['Normal', 'MAM', 'MAS sans complication', 'MAS avec complication'])
    .optional(),
  testAppetit: z.enum(['Bon', 'Faible/Échec']).optional(),

  complicationsMedicales: z.string().trim().optional(),
  priseEnCharge: z.enum(['Aucune', 'URENAM', 'URENI', 'URENAS']).optional(),
  atpe: z.boolean().optional(),
  laitF75: z.boolean().optional(),
  laitF100: z.boolean().optional(),
  amoxicilline: z.boolean().optional(),
  vitamineA: z.boolean().optional(),
  deparasitant: z.boolean().optional(),
  traitementAutre: z.string().trim().optional(),

  numeroVisiteSuivi: z.number().int().positive().optional(),
  evolution: z
    .enum(['En cours', 'Guéri', 'Abandon', 'Décès', 'Référé', 'Non-répondant'])
    .optional(),
  prochainRdv: z.coerce.date().optional(),
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

    if (await isMonthClosed(prisma, auth.orgMember.organizationId, REGISTER_TYPE, new Date())) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The nutrition register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id: patientId } = await ctx.params;

    const parsed = CreateNutritionBody.safeParse(await req.json().catch(() => null));
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

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId: auth.orgMember.organizationId },
    });
    if (!patient) {
      return NextResponse.json(
        { error: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const d = parsed.data;

    const nutrition = await prisma.nutrition.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        ...(d.typeCas ? { typeCas: d.typeCas } : {}),

        ...(d.poidsKg !== undefined ? { poidsKg: d.poidsKg } : {}),
        ...(d.tailleCm !== undefined ? { tailleCm: d.tailleCm } : {}),
        ...(d.perimetreBrachialCm !== undefined
          ? { perimetreBrachialCm: d.perimetreBrachialCm }
          : {}),
        ...(d.oedemes ? { oedemes: d.oedemes } : {}),
        ...(d.statutPT ? { statutPT: d.statutPT } : {}),
        ...(d.classification ? { classification: d.classification } : {}),
        ...(d.testAppetit ? { testAppetit: d.testAppetit } : {}),

        ...(d.complicationsMedicales ? { complicationsMedicales: d.complicationsMedicales } : {}),
        ...(d.priseEnCharge ? { priseEnCharge: d.priseEnCharge } : {}),
        ...(d.atpe !== undefined ? { atpe: d.atpe } : {}),
        ...(d.laitF75 !== undefined ? { laitF75: d.laitF75 } : {}),
        ...(d.laitF100 !== undefined ? { laitF100: d.laitF100 } : {}),
        ...(d.amoxicilline !== undefined ? { amoxicilline: d.amoxicilline } : {}),
        ...(d.vitamineA !== undefined ? { vitamineA: d.vitamineA } : {}),
        ...(d.deparasitant !== undefined ? { deparasitant: d.deparasitant } : {}),
        ...(d.traitementAutre ? { traitementAutre: d.traitementAutre } : {}),

        ...(d.numeroVisiteSuivi !== undefined ? { numeroVisiteSuivi: d.numeroVisiteSuivi } : {}),
        ...(d.evolution ? { evolution: d.evolution } : {}),
        ...(d.prochainRdv !== undefined ? { prochainRdv: d.prochainRdv } : {}),
        ...(d.observations ? { observations: d.observations } : {}),
      },
    });

    return NextResponse.json(
      {
        id: nutrition.id,
        patientId: nutrition.patientId,
        date: nutrition.date.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
