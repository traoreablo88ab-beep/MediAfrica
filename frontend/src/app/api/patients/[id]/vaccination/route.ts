// POST /api/patients/[id]/vaccination — log a vaccine dose administered to a
// patient (PEV — Programme Élargi de Vaccination). providerId is always the
// authenticated staff member (auth.user.sub), never client-supplied. There
// is no PATCH/DELETE — a vaccination record is immuable once created, same
// as Nutrition/Maternite. Refuses with REGISTER_CLOSED once the current
// month's vaccination register has been closed
// (frontend/src/lib/server/registers/closure.ts).
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

const REGISTER_TYPE = 'vaccination';

const CreateVaccinationBody = z.object({
  antigene: z.string().trim().min(1),
  numeroDose: z.number().int().positive().optional(),
  voieAdministration: z
    .enum(['Orale', 'Intramusculaire', 'Sous-cutanée', 'Intradermique'])
    .optional(),
  siteInjection: z
    .enum(['Bras droit', 'Bras gauche', 'Cuisse droite', 'Cuisse gauche', 'Bouche'])
    .optional(),
  numeroLot: z.string().trim().optional(),
  effetsSecondaires: z.string().trim().optional(),
  dejaSousContraception: z.boolean().optional(),
  methodeContraceptivePrecedente: z.string().trim().optional(),
  pfppCounselingPropose: z.boolean().optional(),
  methodePfAdoptee: z.string().trim().optional(),
  conseilsAme: z.enum(['O', 'N', 'NA']).optional(),
  pratiqueAme: z.enum(['O', 'N', 'NA']).optional(),
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
          message: 'The vaccination register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id: patientId } = await ctx.params;

    const parsed = CreateVaccinationBody.safeParse(await req.json().catch(() => null));
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

    const vaccination = await prisma.vaccination.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        antigene: d.antigene,
        ...(d.numeroDose !== undefined ? { numeroDose: d.numeroDose } : {}),
        ...(d.voieAdministration ? { voieAdministration: d.voieAdministration } : {}),
        ...(d.siteInjection ? { siteInjection: d.siteInjection } : {}),
        ...(d.numeroLot ? { numeroLot: d.numeroLot } : {}),
        ...(d.effetsSecondaires ? { effetsSecondaires: d.effetsSecondaires } : {}),
        ...(d.dejaSousContraception !== undefined
          ? { dejaSousContraception: d.dejaSousContraception }
          : {}),
        ...(d.methodeContraceptivePrecedente
          ? { methodeContraceptivePrecedente: d.methodeContraceptivePrecedente }
          : {}),
        ...(d.pfppCounselingPropose !== undefined
          ? { pfppCounselingPropose: d.pfppCounselingPropose }
          : {}),
        ...(d.methodePfAdoptee ? { methodePfAdoptee: d.methodePfAdoptee } : {}),
        ...(d.conseilsAme ? { conseilsAme: d.conseilsAme } : {}),
        ...(d.pratiqueAme ? { pratiqueAme: d.pratiqueAme } : {}),
        ...(d.prochainRdv !== undefined ? { prochainRdv: d.prochainRdv } : {}),
        ...(d.observations ? { observations: d.observations } : {}),
      },
    });

    return NextResponse.json(
      {
        id: vaccination.id,
        patientId: vaccination.patientId,
        date: vaccination.date.toISOString(),
        antigene: vaccination.antigene,
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
