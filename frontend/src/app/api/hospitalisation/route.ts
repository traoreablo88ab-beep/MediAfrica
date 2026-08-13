// GET /api/hospitalisation — cross-patient hospitalisation listing, used by
// the single hospitalisation register page (/registres/hospitalisation) —
// one register covers every service, so `service` is an optional filter
// (comma-separated for multiple values), plus a date range applied to
// `dateHeureEntree` (an admission is filed under its entry month even if
// the discharge happens later). Each row includes its patient
// (id/nom/prenom/dossierNumber) and provider name so the register page
// doesn't need a second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Hospitalisation, Patient, Prisma, User } from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

const ServiceValue = z.enum([
  'Médecine',
  'Chirurgie',
  'Pédiatrie',
  'Maternité',
  'Réanimation',
  'Urgences',
  'Néonatologie',
  'Autre',
]);
const ServiceParam = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()))
  .pipe(z.array(ServiceValue).min(1));

type HospitalisationRow = Hospitalisation & {
  patient: Pick<
    Patient,
    'id' | 'nom' | 'prenom' | 'dossierNumber' | 'dateNaissance' | 'sexe' | 'communeResidence'
  >;
  provider: Pick<User, 'name'> | null;
};

function serializeHospitalisation(h: HospitalisationRow) {
  return {
    id: h.id,
    dateHeureEntree: h.dateHeureEntree.toISOString(),
    motifAdmission: h.motifAdmission,
    service: h.service,
    numeroHospitalisation: h.numeroHospitalisation,
    referenceOrigine: h.referenceOrigine,
    profession: h.profession,
    indigent: h.indigent,
    telephoneContact: h.telephoneContact,
    localisationPrecise: h.localisationPrecise,
    diagnosticPrincipal: h.diagnosticPrincipal,
    diagnosticsSecondaires: h.diagnosticsSecondaires,
    traitementRecu: h.traitementRecu,
    dateHeureSortie: h.dateHeureSortie?.toISOString() ?? null,
    issue: h.issue,
    causeDeces: h.causeDeces,
    structureReference: h.structureReference,
    praticienResponsable: h.praticienResponsable,
    observations: h.observations,

    patient: {
      ...h.patient,
      dateNaissance: h.patient.dateNaissance.toISOString(),
    },
    providerName: h.provider?.name ?? null,
  };
}

function parseDateParam(raw: string | null): Date {
  if (raw) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
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
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const serviceRaw = url.searchParams.get('service');
    let services: z.infer<typeof ServiceValue>[] | null = null;
    if (serviceRaw) {
      const serviceParsed = ServiceParam.safeParse(serviceRaw);
      if (!serviceParsed.success) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid service query param' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      services = serviceParsed.data;
    }

    const dateFromRaw = url.searchParams.get('dateFrom');
    const dateToRaw = url.searchParams.get('dateTo');
    let rangeStart: Date;
    let rangeEnd: Date;
    if (dateFromRaw && dateToRaw) {
      rangeStart = parseDateParam(dateFromRaw);
      rangeEnd = parseDateParam(dateToRaw);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    } else {
      rangeStart = parseDateParam(url.searchParams.get('date'));
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    }

    const where: Prisma.HospitalisationWhereInput = {
      ...(services ? { service: { in: services } } : {}),
      dateHeureEntree: { gte: rangeStart, lt: rangeEnd },
      patient: {
        organizationId: auth.orgMember.organizationId,
        ...(q
          ? {
              OR: [
                { nom: { contains: q, mode: 'insensitive' } },
                { prenom: { contains: q, mode: 'insensitive' } },
                { dossierNumber: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      ...cursorWhere(cursor),
    };

    const rows = await prisma.hospitalisation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        patient: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            dossierNumber: true,
            dateNaissance: true,
            sexe: true,
            communeResidence: true,
          },
        },
        provider: { select: { name: true } },
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      { items: page.items.map(serializeHospitalisation), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
