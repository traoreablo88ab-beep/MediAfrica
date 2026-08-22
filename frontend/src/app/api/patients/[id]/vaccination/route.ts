// POST /api/patients/[id]/vaccination — log a vaccine dose administered to a
// patient (PEV — Programme Élargi de Vaccination). providerId is always the
// authenticated staff member (auth.user.sub), never client-supplied. There
// is no PATCH/DELETE — a vaccination record is immuable once created, same
// as Nutrition/Maternite. Refuses with REGISTER_CLOSED once the current
// month's vaccination register has been closed
// (frontend/src/lib/server/registers/closure.ts).
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

const REGISTER_TYPE = 'vaccination';
const IDEM_KEY_MAX_LEN = 200;

function fingerprintBody(input: {
  patientId: string;
  antigene: string;
  numeroDose: number | null;
}): string {
  const canonical = JSON.stringify(input);
  return createHash('sha256').update(canonical).digest('hex');
}

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
      antigene: d.antigene,
      numeroDose: d.numeroDose ?? null,
    });
    if (idemKey) {
      const existing = await prisma.vaccination.findUnique({
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
            date: existing.date.toISOString(),
            antigene: existing.antigene,
          },
          { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

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
        ...(idemKey ? { idempotencyKey: idemKey, idempotencyBodyHash: bodyHash } : {}),
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
