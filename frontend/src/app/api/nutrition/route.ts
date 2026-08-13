// GET /api/nutrition — cross-patient nutrition listing, used only by the
// register page (/registres/nutrition) — there is no live queue like
// Consultations, so this always needs a date range. Each row includes its
// patient (id/nom/prenom/dossierNumber) and provider name so the register
// page doesn't need a second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Nutrition, Patient, Prisma, User } from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

type NutritionRow = Nutrition & {
  patient: Pick<
    Patient,
    'id' | 'nom' | 'prenom' | 'dossierNumber' | 'dateNaissance' | 'sexe' | 'communeResidence'
  >;
  provider: Pick<User, 'name'> | null;
};

function serializeNutrition(n: NutritionRow) {
  return {
    id: n.id,
    date: n.date.toISOString(),
    typeCas: n.typeCas,

    poidsKg: n.poidsKg,
    tailleCm: n.tailleCm,
    perimetreBrachialCm: n.perimetreBrachialCm,
    oedemes: n.oedemes,
    statutPT: n.statutPT,
    classification: n.classification,
    testAppetit: n.testAppetit,

    complicationsMedicales: n.complicationsMedicales,
    priseEnCharge: n.priseEnCharge,
    atpe: n.atpe,
    laitF75: n.laitF75,
    laitF100: n.laitF100,
    amoxicilline: n.amoxicilline,
    vitamineA: n.vitamineA,
    deparasitant: n.deparasitant,
    traitementAutre: n.traitementAutre,

    numeroVisiteSuivi: n.numeroVisiteSuivi,
    evolution: n.evolution,
    prochainRdv: n.prochainRdv?.toISOString() ?? null,
    observations: n.observations,

    patient: {
      ...n.patient,
      dateNaissance: n.patient.dateNaissance.toISOString(),
    },
    providerName: n.provider?.name ?? null,
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

    const where: Prisma.NutritionWhereInput = {
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

    const rows = await prisma.nutrition.findMany({
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
      { items: page.items.map(serializeNutrition), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
