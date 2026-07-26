// GET /api/patients/[id] — full patient record + consultation history
// (most recent 20, provider name included via relation).
// PATCH /api/patients/[id] — partial update of the patient's own fields
// (identity, contact, medical background). Never touches dossierNumber or
// consultations.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { zPhone } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CONSULTATION_HISTORY_LIMIT = 20;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', reqCtx.requestId);
      return subFail;
    }

    const { id } = await ctx.params;
    const patient = await prisma.patient.findFirst({
      where: { id, organizationId: auth.orgMember.organizationId },
      include: {
        consultations: {
          orderBy: { date: 'desc' },
          take: CONSULTATION_HISTORY_LIMIT,
          include: { provider: { select: { name: true } } },
        },
      },
    });
    if (!patient) {
      return NextResponse.json(
        { error: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { consultations, ...fields } = patient;
    return NextResponse.json(
      {
        ...fields,
        dateNaissance: fields.dateNaissance.toISOString(),
        createdAt: fields.createdAt.toISOString(),
        updatedAt: fields.updatedAt.toISOString(),
        consultations: consultations.map((c) => ({
          id: c.id,
          date: c.date.toISOString(),
          motif: c.motif,
          status: c.status,
          diagnostic: c.diagnostic,
          traitementPrescrit: c.traitementPrescrit,
          tensionArterielle: c.tensionArterielle,
          poidsKg: c.poidsKg,
          tailleCm: c.tailleCm,
          perimetreBrachialCm: c.perimetreBrachialCm,
          statutPT: c.statutPT,
          temperatureC: c.temperatureC,
          typeCas: c.typeCas,
          mdo: c.mdo,
          mdoMaladie: c.mdoMaladie,
          tdr: c.tdr,
          ge: c.ge,
          providerName: c.provider?.name ?? null,
        })),
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

const PatchPatientBody = z.object({
  nom: z.string().trim().min(1).optional(),
  prenom: z.string().trim().min(1).optional(),
  dateNaissance: z.coerce.date().optional(),
  sexe: z.enum(['M', 'F']).optional(),
  telephonePrincipal: zPhone.optional(),
  telephoneSecondaire: zPhone.optional(),
  communeResidence: z.string().trim().min(1).optional(),
  quartierVillage: z.string().trim().optional(),
  contactUrgenceNom: z.string().trim().optional(),
  contactUrgenceTelephone: zPhone.optional(),
  numeroRamed: z.string().trim().optional(),
  numeroAmo: z.string().trim().optional(),
  groupeSanguin: z.string().trim().optional(),
  allergiesConnues: z.string().trim().optional(),
  antecedentsPersonnels: z.string().trim().optional(),
  antecedentsChirurgicaux: z.string().trim().optional(),
  antecedentsFamiliaux: z.string().trim().optional(),
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

    const parsed = PatchPatientBody.safeParse(await req.json().catch(() => null));
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

    const existing = await prisma.patient.findFirst({
      where: { id, organizationId: auth.orgMember.organizationId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const d = parsed.data;
    const updated = await prisma.patient.update({
      where: { id },
      data: {
        ...(d.nom !== undefined ? { nom: d.nom } : {}),
        ...(d.prenom !== undefined ? { prenom: d.prenom } : {}),
        ...(d.dateNaissance !== undefined ? { dateNaissance: d.dateNaissance } : {}),
        ...(d.sexe !== undefined ? { sexe: d.sexe } : {}),
        ...(d.telephonePrincipal !== undefined ? { telephonePrincipal: d.telephonePrincipal } : {}),
        ...(d.telephoneSecondaire !== undefined
          ? { telephoneSecondaire: d.telephoneSecondaire }
          : {}),
        ...(d.communeResidence !== undefined ? { communeResidence: d.communeResidence } : {}),
        ...(d.quartierVillage !== undefined ? { quartierVillage: d.quartierVillage } : {}),
        ...(d.contactUrgenceNom !== undefined ? { contactUrgenceNom: d.contactUrgenceNom } : {}),
        ...(d.contactUrgenceTelephone !== undefined
          ? { contactUrgenceTelephone: d.contactUrgenceTelephone }
          : {}),
        ...(d.numeroRamed !== undefined ? { numeroRamed: d.numeroRamed } : {}),
        ...(d.numeroAmo !== undefined ? { numeroAmo: d.numeroAmo } : {}),
        ...(d.groupeSanguin !== undefined ? { groupeSanguin: d.groupeSanguin } : {}),
        ...(d.allergiesConnues !== undefined ? { allergiesConnues: d.allergiesConnues } : {}),
        ...(d.antecedentsPersonnels !== undefined
          ? { antecedentsPersonnels: d.antecedentsPersonnels }
          : {}),
        ...(d.antecedentsChirurgicaux !== undefined
          ? { antecedentsChirurgicaux: d.antecedentsChirurgicaux }
          : {}),
        ...(d.antecedentsFamiliaux !== undefined
          ? { antecedentsFamiliaux: d.antecedentsFamiliaux }
          : {}),
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        dossierNumber: updated.dossierNumber,
        nom: updated.nom,
        prenom: updated.prenom,
        dateNaissance: updated.dateNaissance.toISOString(),
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
