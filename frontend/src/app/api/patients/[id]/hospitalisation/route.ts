// POST /api/patients/[id]/hospitalisation — admit a patient (opens a
// Hospitalisation record). providerId is always the authenticated staff
// member (auth.user.sub), never client-supplied. Unlike
// Consultation/Maternite/Nutrition/Vaccination, this record is NOT
// immutable — PATCH /api/hospitalisations/[id] fills in the discharge
// fields later. A single hospitalisation register + monthly closure covers
// every service (see /api/registres/hospitalisation/{close,closure}).
//
// Optional `Idempotency-Key` header — same pattern as
// frontend/src/app/api/patients/[id]/consultations/route.ts, used by the
// offline-queue sync path (frontend/src/lib/offlineQueue.ts).
export const runtime = 'nodejs';

import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'hospitalisation';
const IDEM_KEY_MAX_LEN = 200;

function fingerprintBody(input: {
  patientId: string;
  motifAdmission: string;
  dateHeureEntree: string | null;
}): string {
  const canonical = JSON.stringify(input);
  return createHash('sha256').update(canonical).digest('hex');
}

const CreateHospitalisationBody = z.object({
  dateHeureEntree: z.coerce.date().optional(),
  motifAdmission: z.string().trim().min(1),
  // Set only when the discharge is already known at admission time (e.g.
  // backfilling a completed encounter from the paper register) — otherwise
  // left empty and filled in later via PATCH /api/hospitalisations/[id].
  dateHeureSortie: z.coerce.date().optional(),
  indigent: z.boolean().optional(),
  telephoneContact: z.string().trim().optional(),
  localisationPrecise: z.string().trim().optional(),
  service: z
    .enum([
      'Médecine',
      'Chirurgie',
      'Pédiatrie',
      'Maternité',
      'Réanimation',
      'Urgences',
      'Néonatologie',
      'Autre',
    ])
    .optional(),
  numeroHospitalisation: z.string().trim().optional(),
  referenceOrigine: z
    .enum([
      'Non référé',
      'Cscom',
      'Csref',
      'HR',
      'HN',
      'Cabinet Med Privé',
      'Cabinet soins Privé',
      'Clinique privée',
    ])
    .optional(),
  profession: z.string().trim().optional(),
  diagnosticPrincipal: z.string().trim().optional(),
  diagnosticsSecondaires: z.string().trim().optional(),
  traitementRecu: z.string().trim().optional(),
  praticienResponsable: z.string().trim().optional(),
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

    const { id: patientId } = await ctx.params;

    const parsed = CreateHospitalisationBody.safeParse(await req.json().catch(() => null));
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
    const admissionDate = d.dateHeureEntree ?? new Date();
    if (await isMonthClosed(prisma, auth.orgMember.organizationId, REGISTER_TYPE, admissionDate)) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The hospitalisation register for this month is closed.',
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

    const idemKey = req.headers.get('idempotency-key');
    if (idemKey && idemKey.length > IDEM_KEY_MAX_LEN) {
      return NextResponse.json(
        {
          error: 'IDEMPOTENCY_KEY_INVALID',
          message: `Idempotency-Key exceeds ${IDEM_KEY_MAX_LEN} characters`,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const bodyHash = fingerprintBody({
      patientId,
      motifAdmission: d.motifAdmission,
      dateHeureEntree: d.dateHeureEntree ? d.dateHeureEntree.toISOString() : null,
    });
    if (idemKey) {
      const existing = await prisma.hospitalisation.findUnique({
        where: { idempotencyKey: idemKey },
        include: { patient: { select: { organizationId: true } } },
      });
      if (existing) {
        const sameTenant = existing.patient.organizationId === auth.orgMember.organizationId;
        if (!sameTenant || existing.idempotencyBodyHash !== bodyHash) {
          return NextResponse.json(
            {
              error: 'IDEMPOTENCY_KEY_BODY_MISMATCH',
              message: 'Idempotency-Key already used for a different request.',
            },
            { status: 422, headers: { 'x-request-id': reqCtx.requestId } },
          );
        }
        return NextResponse.json(
          {
            id: existing.id,
            patientId: existing.patientId,
            dateHeureEntree: existing.dateHeureEntree.toISOString(),
            motifAdmission: existing.motifAdmission,
          },
          { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const hospitalisation = await prisma.hospitalisation.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        ...(d.dateHeureEntree ? { dateHeureEntree: d.dateHeureEntree } : {}),
        motifAdmission: d.motifAdmission,
        ...(d.dateHeureSortie ? { dateHeureSortie: d.dateHeureSortie } : {}),
        ...(d.indigent !== undefined ? { indigent: d.indigent } : {}),
        ...(d.telephoneContact ? { telephoneContact: d.telephoneContact } : {}),
        ...(d.localisationPrecise ? { localisationPrecise: d.localisationPrecise } : {}),
        ...(d.service ? { service: d.service } : {}),
        ...(d.numeroHospitalisation ? { numeroHospitalisation: d.numeroHospitalisation } : {}),
        ...(d.referenceOrigine ? { referenceOrigine: d.referenceOrigine } : {}),
        ...(d.profession ? { profession: d.profession } : {}),
        ...(d.diagnosticPrincipal ? { diagnosticPrincipal: d.diagnosticPrincipal } : {}),
        ...(d.diagnosticsSecondaires ? { diagnosticsSecondaires: d.diagnosticsSecondaires } : {}),
        ...(d.traitementRecu ? { traitementRecu: d.traitementRecu } : {}),
        ...(d.praticienResponsable ? { praticienResponsable: d.praticienResponsable } : {}),
        ...(d.observations ? { observations: d.observations } : {}),
        ...(idemKey ? { idempotencyKey: idemKey, idempotencyBodyHash: bodyHash } : {}),
      },
    });

    return NextResponse.json(
      {
        id: hospitalisation.id,
        patientId: hospitalisation.patientId,
        dateHeureEntree: hospitalisation.dateHeureEntree.toISOString(),
        motifAdmission: hospitalisation.motifAdmission,
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
