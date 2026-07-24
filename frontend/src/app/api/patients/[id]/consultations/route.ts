// POST /api/patients/[id]/consultations — log a consultation for a patient.
// providerId is always the authenticated staff member (auth.user.sub), never
// client-supplied. Refuses with REGISTER_CLOSED once the current month's
// consultation register has been closed (frontend/src/lib/server/registers/closure.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateConsultationBody = z.object({
  motif: z.string().trim().min(1),
  status: z.enum(['attente', 'consultation', 'traite', 'urgent']).optional(),
  diagnostic: z.string().trim().optional(),
  traitementPrescrit: z.string().trim().optional(),
  tensionArterielle: z.string().trim().optional(),
  poidsKg: z.number().positive().optional(),
  tailleCm: z.number().positive().optional(),
  perimetreBrachialCm: z.number().positive().optional(),
  statutPT: z.string().trim().optional(),
  temperatureC: z.number().optional(),
  typeCas: z.enum(['NC', 'AC']).optional(),
  mdo: z.boolean().optional(),
  mdoMaladie: z.string().trim().optional(),
  tdr: z.enum(['Positif', 'Négatif', 'Non fait']).optional(),
  ge: z.enum(['Positif', 'Négatif', 'Non fait']).optional(),
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

    if (await isMonthClosed(prisma, auth.orgMember.organizationId, 'consultation', new Date())) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The consultation register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id: patientId } = await ctx.params;

    const parsed = CreateConsultationBody.safeParse(await req.json().catch(() => null));
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
    const consultation = await prisma.consultation.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        motif: d.motif,
        ...(d.status ? { status: d.status } : {}),
        ...(d.diagnostic ? { diagnostic: d.diagnostic } : {}),
        ...(d.traitementPrescrit ? { traitementPrescrit: d.traitementPrescrit } : {}),
        ...(d.tensionArterielle ? { tensionArterielle: d.tensionArterielle } : {}),
        ...(d.poidsKg !== undefined ? { poidsKg: d.poidsKg } : {}),
        ...(d.tailleCm !== undefined ? { tailleCm: d.tailleCm } : {}),
        ...(d.perimetreBrachialCm !== undefined
          ? { perimetreBrachialCm: d.perimetreBrachialCm }
          : {}),
        ...(d.statutPT ? { statutPT: d.statutPT } : {}),
        ...(d.temperatureC !== undefined ? { temperatureC: d.temperatureC } : {}),
        ...(d.typeCas ? { typeCas: d.typeCas } : {}),
        ...(d.mdo !== undefined ? { mdo: d.mdo } : {}),
        ...(d.mdoMaladie ? { mdoMaladie: d.mdoMaladie } : {}),
        ...(d.tdr ? { tdr: d.tdr } : {}),
        ...(d.ge ? { ge: d.ge } : {}),
      },
    });

    return NextResponse.json(
      {
        id: consultation.id,
        patientId: consultation.patientId,
        date: consultation.date.toISOString(),
        motif: consultation.motif,
        status: consultation.status,
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
