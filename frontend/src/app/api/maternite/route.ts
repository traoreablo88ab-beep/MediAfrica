// GET /api/maternite — cross-patient maternité listing, used only by the 3
// register pages (/registres/maternite/{cpn,accouchement,cpon}) — there is
// no live queue like Consultations, so this always needs an explicit `type`
// filter plus a date range. Each row includes its patient (id/nom/prenom/
// dossierNumber) and provider name so the register page doesn't need a
// second round-trip per row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Maternite, Patient, Prisma, User } from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Q_MAX = 200;

const TypeParam = z.enum(['CPN', 'ACCOUCHEMENT', 'CPON']);

type MaterniteRow = Maternite & {
  patient: Pick<
    Patient,
    'id' | 'nom' | 'prenom' | 'dossierNumber' | 'dateNaissance' | 'sexe' | 'communeResidence'
  >;
  provider: Pick<User, 'name'> | null;
};

function serializeMaternite(m: MaterniteRow) {
  return {
    id: m.id,
    date: m.date.toISOString(),
    type: m.type,

    gestite: m.gestite,
    parite: m.parite,
    dpa: m.dpa?.toISOString() ?? null,
    ddr: m.ddr?.toISOString() ?? null,
    statutMatrimonial: m.statutMatrimonial,
    observations: m.observations,

    cpnNumeroVisite: m.cpnNumeroVisite,
    ageGestationnelSemaines: m.ageGestationnelSemaines,
    poidsKg: m.poidsKg,
    tailleCm: m.tailleCm,
    perimetreBrachialCm: m.perimetreBrachialCm,
    temperatureC: m.temperatureC,
    tensionArterielle: m.tensionArterielle,
    hauteurUterineCm: m.hauteurUterineCm,
    bruitsCoeurFoetal: m.bruitsCoeurFoetal,
    mouvementsFoetaux: m.mouvementsFoetaux,
    oedemes: m.oedemes,
    nombreAvortements: m.nombreAvortements,
    nombreEnfantsVivants: m.nombreEnfantsVivants,
    groupeSanguin: m.groupeSanguin,
    testEmmel: m.testEmmel,
    bw: m.bw,
    tauxHb: m.tauxHb,
    tpiDose: m.tpiDose,
    moustiquaireImpregnee: m.moustiquaireImpregnee,
    vatDose: m.vatDose,
    ferAcideFolique: m.ferAcideFolique,
    ferAcideFoliqueDoseNumero: m.ferAcideFoliqueDoseNumero,
    albendazoleMebendazole: m.albendazoleMebendazole,
    albuminurie: m.albuminurie,
    glycosurie: m.glycosurie,
    vih: m.vih,
    planAccouchement: m.planAccouchement,
    risqueGrossesse: m.risqueGrossesse,
    maladieDetectee: m.maladieDetectee,
    prochainRdv: m.prochainRdv?.toISOString() ?? null,

    dateHeureEntree: m.dateHeureEntree?.toISOString() ?? null,
    enfantPrecedent: m.enfantPrecedent,
    intervalleGrossessesMois: m.intervalleGrossessesMois,
    lieuAccouchement: m.lieuAccouchement,
    natureAccouchement: m.natureAccouchement,
    presentation: m.presentation,
    modeAccouchement: m.modeAccouchement,
    gatpa: m.gatpa,
    avortementType: m.avortementType,
    methodeEvacuationAvortement: m.methodeEvacuationAvortement,
    dureeTravailHeures: m.dureeTravailHeures,
    assistePar: m.assistePar,
    vitamineA: m.vitamineA,
    issueGrossesse: m.issueGrossesse,
    sexeNouveauNe: m.sexeNouveauNe,
    misAuSein: m.misAuSein,
    smk: m.smk,
    tetracyclinePommade: m.tetracyclinePommade,
    chlorhexidineDigluconate: m.chlorhexidineDigluconate,
    poidsNaissanceG: m.poidsNaissanceG,
    tailleNaissanceCm: m.tailleNaissanceCm,
    apgar1min: m.apgar1min,
    apgar5min: m.apgar5min,
    perimetreCranienCm: m.perimetreCranienCm,
    reanimationNouveauNe: m.reanimationNouveauNe,
    decesNouveauNeDelai: m.decesNouveauNeDelai,
    causesDeces: m.causesDeces,
    decesMaternelMoment: m.decesMaternelMoment,
    causesDecesMaternel: m.causesDecesMaternel,
    praticienQualification: m.praticienQualification,
    complicationsAccouchement: m.complicationsAccouchement,
    complicationsNouveauNe: m.complicationsNouveauNe,
    episiotomie: m.episiotomie,
    placentaComplet: m.placentaComplet,

    cponNumeroVisite: m.cponNumeroVisite,
    joursPostPartum: m.joursPostPartum,
    etatPerinee: m.etatPerinee,
    allaitement: m.allaitement,
    planificationFamiliale: m.planificationFamiliale,
    etatNouveauNeCpon: m.etatNouveauNeCpon,
    vaccinationBcgFait: m.vaccinationBcgFait,

    patient: {
      ...m.patient,
      dateNaissance: m.patient.dateNaissance.toISOString(),
    },
    providerName: m.provider?.name ?? null,
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

    const where: Prisma.MaterniteWhereInput = {
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

    const rows = await prisma.maternite.findMany({
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
      { items: page.items.map(serializeMaternite), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
