// GET /api/patients — search + filter (sexe, commune, statut du jour) +
// cursor pagination. Each row includes its most recent Consultation so the
// list can show Motif/Heure/Statut without a second round-trip.
// POST /api/patients — create a bare Patient record (dossier number
// generated server-side inside the same transaction).
//
// Optional `Idempotency-Key` header on POST — same pattern as
// frontend/src/app/api/patients/[id]/consultations/route.ts, used by the
// offline-queue sync path (frontend/src/lib/offlineQueue.ts). Checked BEFORE
// the DUPLICATE_PATIENT lookup: an exact replay of an already-synced create
// must short-circuit to the original row, not re-run the duplicate-name/
// phone heuristic (which stays as-is for genuinely new submissions).
export const runtime = 'nodejs';

import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Consultation, Patient, Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { zPhone } from '@/lib/server/zod-helpers';
import { generateDossierNumber } from '@/lib/server/patients/dossier-number';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;
const IDEM_KEY_MAX_LEN = 200;

function fingerprintBody(input: {
  nom: string;
  prenom: string;
  dateNaissance: string;
  telephonePrincipal: string;
}): string {
  const canonical = JSON.stringify(input);
  return createHash('sha256').update(canonical).digest('hex');
}

type PatientWithLatestConsultation = Patient & { consultations: Consultation[] };

function serializePatient(p: PatientWithLatestConsultation) {
  const latest = p.consultations[0] ?? null;
  return {
    id: p.id,
    dossierNumber: p.dossierNumber,
    nom: p.nom,
    prenom: p.prenom,
    dateNaissance: p.dateNaissance.toISOString(),
    sexe: p.sexe,
    telephonePrincipal: p.telephonePrincipal,
    communeResidence: p.communeResidence,
    createdAt: p.createdAt.toISOString(),
    latestConsultation: latest
      ? {
          id: latest.id,
          date: latest.date.toISOString(),
          motif: latest.motif,
          status: latest.status,
        }
      : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const sexe = url.searchParams.get('sexe');
    const communeResidence = url.searchParams.get('commune');
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const where: Prisma.PatientWhereInput = {
      organizationId: auth.orgMember.organizationId,
      ...(q
        ? {
            OR: [
              { nom: { contains: q, mode: 'insensitive' } },
              { prenom: { contains: q, mode: 'insensitive' } },
              { dossierNumber: { contains: q, mode: 'insensitive' } },
              { telephonePrincipal: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(sexe ? { sexe } : {}),
      ...(communeResidence ? { communeResidence } : {}),
      // "Statut" filters to patients with a consultation TODAY in that
      // status — a status is a property of today's visit, not a permanent
      // patient attribute.
      ...(status ? { consultations: { some: { status, date: { gte: startOfToday } } } } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.patient.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { consultations: { orderBy: { date: 'desc' }, take: 1 } },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      { items: page.items.map(serializePatient), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreatePatientBody = z.object({
  nom: z.string().trim().min(1),
  prenom: z.string().trim().min(1),
  dateNaissance: z.coerce.date(),
  sexe: z.enum(['M', 'F']),
  telephonePrincipal: zPhone,
  telephoneSecondaire: zPhone.optional(),
  communeResidence: z.string().trim().min(1),
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
  // Set by the client after the user confirms "Créer quand même" on a
  // DUPLICATE_PATIENT warning — skips the duplicate check below.
  force: z.boolean().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const parsed = CreatePatientBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
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
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const bodyHash = fingerprintBody({
      nom: d.nom,
      prenom: d.prenom,
      dateNaissance: d.dateNaissance.toISOString(),
      telephonePrincipal: d.telephonePrincipal,
    });
    if (idemKey) {
      const existing = await prisma.patient.findUnique({ where: { idempotencyKey: idemKey } });
      if (existing) {
        const sameTenant = existing.organizationId === auth.orgMember.organizationId;
        if (!sameTenant || existing.idempotencyBodyHash !== bodyHash) {
          return NextResponse.json(
            {
              error: 'IDEMPOTENCY_KEY_BODY_MISMATCH',
              message: 'Idempotency-Key already used for a different request.',
            },
            { status: 422, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        return NextResponse.json(
          {
            id: existing.id,
            dossierNumber: existing.dossierNumber,
            nom: existing.nom,
            prenom: existing.prenom,
            dateNaissance: existing.dateNaissance.toISOString(),
            sexe: existing.sexe,
          },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // Same name + birthdate, or same primary phone, likely means this
    // patient already has a dossier — surface it instead of silently
    // creating a duplicate record. The client can resubmit with force:true
    // once staff confirm it's genuinely a different person.
    if (!d.force) {
      const duplicate = await prisma.patient.findFirst({
        where: {
          organizationId: auth.orgMember.organizationId,
          OR: [
            {
              nom: { equals: d.nom, mode: 'insensitive' },
              prenom: { equals: d.prenom, mode: 'insensitive' },
              dateNaissance: d.dateNaissance,
            },
            { telephonePrincipal: d.telephonePrincipal },
          ],
        },
        select: { id: true, dossierNumber: true, nom: true, prenom: true },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            error: 'DUPLICATE_PATIENT',
            message: `Un dossier similaire existe déjà : ${duplicate.nom}, ${duplicate.prenom} (${duplicate.dossierNumber}).`,
            existingPatientId: duplicate.id,
            existingDossierNumber: duplicate.dossierNumber,
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const patient = await prisma.$transaction(async (tx) => {
      const dossierNumber = await generateDossierNumber(tx);
      return tx.patient.create({
        data: {
          organizationId: auth.orgMember.organizationId,
          dossierNumber,
          nom: d.nom,
          prenom: d.prenom,
          dateNaissance: d.dateNaissance,
          sexe: d.sexe,
          telephonePrincipal: d.telephonePrincipal,
          communeResidence: d.communeResidence,
          ...(d.telephoneSecondaire ? { telephoneSecondaire: d.telephoneSecondaire } : {}),
          ...(d.quartierVillage ? { quartierVillage: d.quartierVillage } : {}),
          ...(d.contactUrgenceNom ? { contactUrgenceNom: d.contactUrgenceNom } : {}),
          ...(d.contactUrgenceTelephone
            ? { contactUrgenceTelephone: d.contactUrgenceTelephone }
            : {}),
          ...(d.numeroRamed ? { numeroRamed: d.numeroRamed } : {}),
          ...(d.numeroAmo ? { numeroAmo: d.numeroAmo } : {}),
          ...(d.groupeSanguin ? { groupeSanguin: d.groupeSanguin } : {}),
          ...(d.allergiesConnues ? { allergiesConnues: d.allergiesConnues } : {}),
          ...(d.antecedentsPersonnels ? { antecedentsPersonnels: d.antecedentsPersonnels } : {}),
          ...(d.antecedentsChirurgicaux
            ? { antecedentsChirurgicaux: d.antecedentsChirurgicaux }
            : {}),
          ...(d.antecedentsFamiliaux ? { antecedentsFamiliaux: d.antecedentsFamiliaux } : {}),
          ...(idemKey ? { idempotencyKey: idemKey, idempotencyBodyHash: bodyHash } : {}),
        },
      });
    });

    return NextResponse.json(
      {
        id: patient.id,
        dossierNumber: patient.dossierNumber,
        nom: patient.nom,
        prenom: patient.prenom,
        dateNaissance: patient.dateNaissance.toISOString(),
        sexe: patient.sexe,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
