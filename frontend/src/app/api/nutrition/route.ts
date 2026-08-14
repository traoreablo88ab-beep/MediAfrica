// GET /api/nutrition — cross-patient PCIMA listing, used only by the 3
// register pages (/registres/nutrition/{ureni,urenas,urenam}) — there is no
// live queue like Consultations, so this always needs an explicit `type`
// filter plus a date range. Each row includes its patient (id/nom/prenom/
// dossierNumber), provider name, and (for URENAM) its nested visites so the
// register page doesn't need a second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type {
  Nutrition,
  NutritionEvenement,
  NutritionVisiteSuivi,
  Patient,
  Prisma,
  User,
} from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

const TypeParam = z.enum(['URENI', 'URENAS', 'URENAM']);

type NutritionBaseRow = Nutrition & {
  patient: Pick<
    Patient,
    'id' | 'nom' | 'prenom' | 'dossierNumber' | 'dateNaissance' | 'sexe' | 'communeResidence'
  >;
  provider: Pick<User, 'name'> | null;
};

type NutritionRow = NutritionBaseRow & {
  visites: NutritionVisiteSuivi[];
  evenements: NutritionEvenement[];
};

function serializeNutritionCommon(n: NutritionBaseRow) {
  return {
    id: n.id,
    date: n.date.toISOString(),
    type: n.type,

    numeroMas: n.numeroMas,
    telephoneContact: n.telephoneContact,
    localisationPrecise: n.localisationPrecise,
    ageMois: n.ageMois,
    modeAdmission: n.modeAdmission,
    typeCas: n.typeCas,
    poidsKg: n.poidsKg,
    tailleCm: n.tailleCm,
    perimetreBrachialCm: n.perimetreBrachialCm,
    ptIndice: n.ptIndice,
    oedemes: n.oedemes,
    pathologiesAssociees: n.pathologiesAssociees,

    nomPere: n.nomPere,
    nomMere: n.nomMere,
    allaite: n.allaite,
    jumeaux: n.jumeaux,
    parentsVivants: n.parentsVivants,
    sourceAdmission: n.sourceAdmission,
    provenanceProgramme: n.provenanceProgramme,
    carteVaccination: n.carteVaccination,
    vaccinationAJour: n.vaccinationAJour,

    dateSortie: n.dateSortie?.toISOString() ?? null,
    poidsSortieKg: n.poidsSortieKg,
    tailleSortieCm: n.tailleSortieCm,
    perimetreBrachialSortieCm: n.perimetreBrachialSortieCm,
    ptIndiceSortie: n.ptIndiceSortie,
    oedemeSortie: n.oedemeSortie,
    typeSortie: n.typeSortie,
    destinationProgramme: n.destinationProgramme,
    datePoidsMinimum: n.datePoidsMinimum?.toISOString() ?? null,
    poidsMinimumKg: n.poidsMinimumKg,
    seancesStimulationPsychocognitive: n.seancesStimulationPsychocognitive,
    seancesCcsc: n.seancesCcsc,
    beneficiairePoudreNutritive: n.beneficiairePoudreNutritive,
    beneficiairePlaquette: n.beneficiairePlaquette,
    dureeSejourJours: n.dureeSejourJours,
    observations: n.observations,

    patient: {
      ...n.patient,
      dateNaissance: n.patient.dateNaissance.toISOString(),
    },
    providerName: n.provider?.name ?? null,
  };
}

// Used by ?summary=1 — skips visites/evenements entirely (neither the nested
// Prisma include nor the serialized keys), for callers that only need the
// flat episode fields (e.g. the RMA page's wide date-range cohort fetch).
function serializeNutritionSummary(n: NutritionBaseRow) {
  return serializeNutritionCommon(n);
}

function serializeNutrition(n: NutritionRow) {
  return {
    ...serializeNutritionCommon(n),
    visites: n.visites.map((v) => ({
      id: v.id,
      numeroVisite: v.numeroVisite,
      date: v.date.toISOString(),
      poidsKg: v.poidsKg,
      tailleCm: v.tailleCm,
      perimetreBrachialCm: v.perimetreBrachialCm,
      ptIndice: v.ptIndice,
      oedemes: v.oedemes,
      type: v.type,
      testAppetit: v.testAppetit,
      diarrheeJours: v.diarrheeJours,
      vomissementJours: v.vomissementJours,
      fievreJours: v.fievreJours,
      touxJours: v.touxJours,
      temperatureC: v.temperatureC,
      resultatTestPalu: v.resultatTestPalu,
      atpeSachets: v.atpeSachets,
      dermatoses: v.dermatoses,
      alerteLethargique: v.alerteLethargique,
      frequenceRespiratoireMin: v.frequenceRespiratoireMin,
      seancesEducationNutritionnelle: v.seancesEducationNutritionnelle,
      seancesStimulation: v.seancesStimulation,
      observations: v.observations,
    })),

    evenements: n.evenements.map((e) => ({
      id: e.id,
      type: e.type,
      date: e.date.toISOString(),
      raison: e.raison,
      conclusion: e.conclusion,
      centre: e.centre,
      resultat: e.resultat,
    })),
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
    const summary = url.searchParams.get('summary') === '1';

    const typeParsed = TypeParam.safeParse(url.searchParams.get('type'));
    if (!typeParsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'A valid type query param is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
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

    const where: Prisma.NutritionWhereInput = {
      type: typeParsed.data,
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

    const patientSelect = {
      id: true,
      nom: true,
      prenom: true,
      dossierNumber: true,
      dateNaissance: true,
      sexe: true,
      communeResidence: true,
    } as const;

    if (summary) {
      const rows = await prisma.nutrition.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          patient: { select: patientSelect },
          provider: { select: { name: true } },
        },
      });
      const page = buildPage(rows, limit);
      return NextResponse.json(
        { items: page.items.map(serializeNutritionSummary), nextCursor: page.nextCursor },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await prisma.nutrition.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        patient: { select: patientSelect },
        provider: { select: { name: true } },
        visites: { orderBy: { numeroVisite: 'asc' } },
        evenements: { orderBy: { date: 'asc' } },
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      { items: page.items.map(serializeNutrition), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
