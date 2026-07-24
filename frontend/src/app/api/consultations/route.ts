// GET /api/consultations — cross-patient consultation queue: search + filter
// (statut, date — defaults to today) + cursor pagination. Each row includes
// its patient (id/nom/prenom/dossierNumber) and provider name so the
// Consultations page doesn't need a second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Consultation, Patient, Prisma, User } from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

type ConsultationRow = Consultation & {
  patient: Pick<
    Patient,
    'id' | 'nom' | 'prenom' | 'dossierNumber' | 'dateNaissance' | 'sexe' | 'communeResidence'
  >;
  provider: Pick<User, 'name'> | null;
};

function serializeConsultation(c: ConsultationRow) {
  return {
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
    patient: {
      ...c.patient,
      dateNaissance: c.patient.dateNaissance.toISOString(),
    },
    providerName: c.provider?.name ?? null,
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

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    // dateFrom/dateTo (a range, used by the Registre page) take precedence
    // over the single-day `date` param (used by the daily Consultations
    // queue) when both are given.
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

    const where: Prisma.ConsultationWhereInput = {
      date: { gte: rangeStart, lt: rangeEnd },
      ...(status ? { status } : {}),
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

    const rows = await prisma.consultation.findMany({
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
      { items: page.items.map(serializeConsultation), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
