// POST /api/patients/[id]/nutrition — open a PCIMA record (URENI, URENAS or
// URENAM) for a patient. providerId is always the authenticated staff
// member (auth.user.sub), never client-supplied. Unlike Consultation/
// Maternite, this record is NOT immutable — PATCH /api/nutritions/[id]
// fills in the sortie/issue fields later (URENI/URENAS discharge, URENAM
// final outcome), and URENAM additionally grows follow-up visites via POST
// /api/nutritions/[id]/visites. Refuses with REGISTER_CLOSED once the
// current month's register for the specific type (nutrition-ureni |
// nutrition-urenas | nutrition-urenam) has been closed
// (frontend/src/lib/server/registers/closure.ts).
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

const CreateNutritionBody = z.object({
  type: z.enum(['URENI', 'URENAS', 'URENAM']),
  date: z.coerce.date().optional(),

  // Communs — admission / épisode
  numeroMas: z.string().trim().optional(),
  telephoneContact: z.string().trim().optional(),
  localisationPrecise: z.string().trim().optional(),
  ageMois: z.number().int().min(0).optional(),
  modeAdmission: z.string().trim().optional(),
  typeCas: z.enum(['NC', 'AC', 'Réadmission']).optional(),
  poidsKg: z.number().positive().optional(),
  tailleCm: z.number().positive().optional(),
  perimetreBrachialCm: z.number().positive().optional(),
  ptIndice: z.string().trim().optional(),
  oedemes: z.enum(['Non', '+', '++', '+++']).optional(),
  pathologiesAssociees: z.string().trim().optional(),

  // Contexte admission (URENI/URENAS) — pas de PATCH ultérieur
  nomPere: z.string().trim().optional(),
  nomMere: z.string().trim().optional(),
  allaite: z.boolean().optional(),
  jumeaux: z.boolean().optional(),
  parentsVivants: z.boolean().optional(),
  sourceAdmission: z.enum(['Référé', 'Spontané', 'Dépistage actif']).optional(),
  provenanceProgramme: z.enum(['URENI', 'URENAS', 'URENAM']).optional(),
  carteVaccination: z.boolean().optional(),
  vaccinationAJour: z.boolean().optional(),
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

    const d = parsed.data;
    const admissionDate = d.date ?? new Date();
    const registerType = REGISTER_TYPE_BY_NUTRITION_TYPE[d.type];
    if (
      registerType &&
      (await isMonthClosed(prisma, auth.orgMember.organizationId, registerType, admissionDate))
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
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

    const nutrition = await prisma.nutrition.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        type: d.type,
        ...(d.date ? { date: d.date } : {}),
        ...(d.numeroMas ? { numeroMas: d.numeroMas } : {}),
        ...(d.telephoneContact ? { telephoneContact: d.telephoneContact } : {}),
        ...(d.localisationPrecise ? { localisationPrecise: d.localisationPrecise } : {}),
        ...(d.ageMois !== undefined ? { ageMois: d.ageMois } : {}),
        ...(d.modeAdmission ? { modeAdmission: d.modeAdmission } : {}),
        ...(d.typeCas ? { typeCas: d.typeCas } : {}),
        ...(d.poidsKg !== undefined ? { poidsKg: d.poidsKg } : {}),
        ...(d.tailleCm !== undefined ? { tailleCm: d.tailleCm } : {}),
        ...(d.perimetreBrachialCm !== undefined
          ? { perimetreBrachialCm: d.perimetreBrachialCm }
          : {}),
        ...(d.ptIndice ? { ptIndice: d.ptIndice } : {}),
        ...(d.oedemes ? { oedemes: d.oedemes } : {}),
        ...(d.pathologiesAssociees ? { pathologiesAssociees: d.pathologiesAssociees } : {}),
        ...(d.nomPere ? { nomPere: d.nomPere } : {}),
        ...(d.nomMere ? { nomMere: d.nomMere } : {}),
        ...(d.allaite !== undefined ? { allaite: d.allaite } : {}),
        ...(d.jumeaux !== undefined ? { jumeaux: d.jumeaux } : {}),
        ...(d.parentsVivants !== undefined ? { parentsVivants: d.parentsVivants } : {}),
        ...(d.sourceAdmission ? { sourceAdmission: d.sourceAdmission } : {}),
        ...(d.provenanceProgramme ? { provenanceProgramme: d.provenanceProgramme } : {}),
        ...(d.carteVaccination !== undefined ? { carteVaccination: d.carteVaccination } : {}),
        ...(d.vaccinationAJour !== undefined ? { vaccinationAJour: d.vaccinationAJour } : {}),
      },
    });

    return NextResponse.json(
      {
        id: nutrition.id,
        patientId: nutrition.patientId,
        type: nutrition.type,
        date: nutrition.date.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
