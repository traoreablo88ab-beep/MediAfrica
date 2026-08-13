// GET /api/vaccination — cross-patient vaccination listing, used only by
// the register page (/registres/vaccination) — there is no live queue like
// Consultations, so this always needs a date range. Each row includes its
// patient (id/nom/prenom/dossierNumber) and provider name so the register
// page doesn't need a second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Vaccination, Patient, Prisma, User } from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

type VaccinationRow = Vaccination & {
  patient: Pick<
    Patient,
    'id' | 'nom' | 'prenom' | 'dossierNumber' | 'dateNaissance' | 'sexe' | 'communeResidence'
  >;
  provider: Pick<User, 'name'> | null;
};

function serializeVaccination(v: VaccinationRow) {
  return {
    id: v.id,
    date: v.date.toISOString(),
    antigene: v.antigene,
    numeroDose: v.numeroDose,
    voieAdministration: v.voieAdministration,
    siteInjection: v.siteInjection,
    numeroLot: v.numeroLot,
    effetsSecondaires: v.effetsSecondaires,
    dejaSousContraception: v.dejaSousContraception,
    methodeContraceptivePrecedente: v.methodeContraceptivePrecedente,
    pfppCounselingPropose: v.pfppCounselingPropose,
    methodePfAdoptee: v.methodePfAdoptee,
    conseilsAme: v.conseilsAme,
    pratiqueAme: v.pratiqueAme,
    prochainRdv: v.prochainRdv?.toISOString() ?? null,
    observations: v.observations,

    patient: {
      ...v.patient,
      dateNaissance: v.patient.dateNaissance.toISOString(),
    },
    providerName: v.provider?.name ?? null,
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

    const where: Prisma.VaccinationWhereInput = {
      date: { gte: rangeStart, lt: rangeEnd },
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

    const rows = await prisma.vaccination.findMany({
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
      { items: page.items.map(serializeVaccination), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
