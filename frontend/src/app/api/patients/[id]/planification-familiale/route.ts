// POST /api/patients/[id]/planification-familiale — log a family planning
// visit for a patient. providerId is always the authenticated staff member
// (auth.user.sub), never client-supplied. There is no PATCH/DELETE — a
// planification familiale record is immuable once created, same as
// Nutrition/Vaccination/Maternite. Refuses with REGISTER_CLOSED once the
// current month's register has been closed
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

const REGISTER_TYPE = 'planification-familiale';
const IDEM_KEY_MAX_LEN = 200;

function fingerprintBody(input: {
  patientId: string;
  typeVisite: string;
  methodeChoisie: string;
}): string {
  const canonical = JSON.stringify(input);
  return createHash('sha256').update(canonical).digest('hex');
}

const CreatePFBody = z.object({
  typeVisite: z.enum([
    'Nouvelle acceptante',
    'Cliente continuante',
    'Changement de méthode',
    'Retrait/Abandon',
  ]),
  methodeChoisie: z.enum([
    'DIU',
    'Pilule COC',
    'Pilule COP',
    'Jadelle',
    'Implanon',
    'DMPA-IM',
    'DMPA-SC',
    'MAMA',
    'Collier',
    'CCV',
    'Condom masculin',
    'Condom féminin',
    'Autre',
  ]),
  actionMethode: z
    .enum([
      '1ère dotation',
      'Renouvellement',
      'Insertion',
      'Réinsertion',
      'Retrait',
      'Suivi/Contrôle',
      'PPI 48H',
      'Per Césarienne',
      'Post placentaire',
      '1ère injection',
      'Auto-injection',
      'Pratique',
      'Pratique (per césarienne)',
      'Pratique (en dehors césarienne)',
      'Dotation',
    ])
    .optional(),
  nbreCyclesDistribues: z.number().int().positive().optional(),
  methodePrecedente: z.string().trim().optional(),
  parite: z.number().int().min(0).optional(),
  gestite: z.number().int().min(0).optional(),
  tensionArterielle: z.string().trim().optional(),
  poidsKg: z.number().positive().optional(),
  counselingDonne: z.boolean().optional(),
  effetsSecondairesRapportes: z.string().trim().optional(),
  quantiteRemise: z.string().trim().optional(),
  typeUtilisateur: z.enum(['Nouveau', 'Ancien']).optional(),
  ageDernierEnfantMois: z.number().int().min(0).optional(),
  pratiqueAme: z.enum(['O', 'N', 'NA']).optional(),
  enfantAJourVaccins: z.enum(['O', 'N', 'NA']).optional(),
  conseilsAlimentationComplement: z.enum(['O', 'N', 'NA']).optional(),
  serviceProvenance: z
    .enum(['Accouchement', 'CPoN', 'SPE', 'Vaccination', 'Post avortement'])
    .optional(),
  ppi: z.boolean().optional(),
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
          message: 'The planification familiale register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id: patientId } = await ctx.params;

    const parsed = CreatePFBody.safeParse(await req.json().catch(() => null));
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
      typeVisite: d.typeVisite,
      methodeChoisie: d.methodeChoisie,
    });
    if (idemKey) {
      const existing = await prisma.planificationFamiliale.findUnique({
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
            typeVisite: existing.typeVisite,
            methodeChoisie: existing.methodeChoisie,
          },
          { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const pf = await prisma.planificationFamiliale.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        typeVisite: d.typeVisite,
        methodeChoisie: d.methodeChoisie,
        ...(d.actionMethode ? { actionMethode: d.actionMethode } : {}),
        ...(d.nbreCyclesDistribues !== undefined
          ? { nbreCyclesDistribues: d.nbreCyclesDistribues }
          : {}),
        ...(d.methodePrecedente ? { methodePrecedente: d.methodePrecedente } : {}),
        ...(d.parite !== undefined ? { parite: d.parite } : {}),
        ...(d.gestite !== undefined ? { gestite: d.gestite } : {}),
        ...(d.tensionArterielle ? { tensionArterielle: d.tensionArterielle } : {}),
        ...(d.poidsKg !== undefined ? { poidsKg: d.poidsKg } : {}),
        ...(d.counselingDonne !== undefined ? { counselingDonne: d.counselingDonne } : {}),
        ...(d.effetsSecondairesRapportes
          ? { effetsSecondairesRapportes: d.effetsSecondairesRapportes }
          : {}),
        ...(d.quantiteRemise ? { quantiteRemise: d.quantiteRemise } : {}),
        ...(d.typeUtilisateur ? { typeUtilisateur: d.typeUtilisateur } : {}),
        ...(d.ageDernierEnfantMois !== undefined
          ? { ageDernierEnfantMois: d.ageDernierEnfantMois }
          : {}),
        ...(d.pratiqueAme ? { pratiqueAme: d.pratiqueAme } : {}),
        ...(d.enfantAJourVaccins ? { enfantAJourVaccins: d.enfantAJourVaccins } : {}),
        ...(d.conseilsAlimentationComplement
          ? { conseilsAlimentationComplement: d.conseilsAlimentationComplement }
          : {}),
        ...(d.serviceProvenance ? { serviceProvenance: d.serviceProvenance } : {}),
        ...(d.ppi !== undefined ? { ppi: d.ppi } : {}),
        ...(d.prochainRdv !== undefined ? { prochainRdv: d.prochainRdv } : {}),
        ...(d.observations ? { observations: d.observations } : {}),
        ...(idemKey ? { idempotencyKey: idemKey, idempotencyBodyHash: bodyHash } : {}),
      },
    });

    return NextResponse.json(
      {
        id: pf.id,
        patientId: pf.patientId,
        date: pf.date.toISOString(),
        typeVisite: pf.typeVisite,
        methodeChoisie: pf.methodeChoisie,
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
