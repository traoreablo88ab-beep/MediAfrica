// POST /api/patients/[id]/maternite — log a maternité record (CPN,
// Accouchement or CPoN) for a patient. providerId is always the
// authenticated staff member (auth.user.sub), never client-supplied. There
// is no PATCH/DELETE — a maternité record is immuable once created. Refuses
// with REGISTER_CLOSED once the current month's register for that specific
// type (maternite-cpn | maternite-accouchement | maternite-cpon) has been
// closed (frontend/src/lib/server/registers/closure.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE_BY_MATERNITE_TYPE: Record<string, string> = {
  CPN: 'maternite-cpn',
  ACCOUCHEMENT: 'maternite-accouchement',
  CPON: 'maternite-cpon',
};

const CreateMaterniteBody = z.object({
  type: z.enum(['CPN', 'ACCOUCHEMENT', 'CPON']),

  // Communs
  gestite: z.number().int().positive().optional(),
  parite: z.number().int().min(0).optional(),
  dpa: z.coerce.date().optional(),
  ddr: z.coerce.date().optional(),
  observations: z.string().trim().optional(),

  // CPN
  cpnNumeroVisite: z.number().int().positive().optional(),
  ageGestationnelSemaines: z.number().int().positive().optional(),
  poidsKg: z.number().positive().optional(),
  tensionArterielle: z.string().trim().optional(),
  hauteurUterineCm: z.number().positive().optional(),
  bruitsCoeurFoetal: z.enum(['Perçus', 'Non perçus']).optional(),
  mouvementsFoetaux: z.enum(['Perçus', 'Non perçus']).optional(),
  oedemes: z.boolean().optional(),
  tpiDose: z.number().int().min(0).optional(),
  moustiquaireImpregnee: z.boolean().optional(),
  vatDose: z.number().int().min(0).optional(),
  ferAcideFolique: z.boolean().optional(),
  albuminurie: z.enum(['Positif', 'Négatif', 'Non fait']).optional(),
  glycosurie: z.enum(['Positif', 'Négatif', 'Non fait']).optional(),
  vih: z.enum(['Positif', 'Négatif', 'Non fait', 'Connu positif']).optional(),
  prochainRdv: z.coerce.date().optional(),

  // Accouchement
  modeAccouchement: z.enum(['Voie basse', 'Césarienne', 'Instrumental']).optional(),
  dureeTravailHeures: z.number().positive().optional(),
  assistePar: z.enum(['Sage-femme', 'Médecin', 'Matrone', 'Auxiliaire']).optional(),
  issueGrossesse: z.enum(['Vivant', 'Mort-né frais', 'Mort-né macéré']).optional(),
  sexeNouveauNe: z.enum(['M', 'F']).optional(),
  poidsNaissanceG: z.number().positive().optional(),
  apgar1min: z.number().int().min(0).max(10).optional(),
  apgar5min: z.number().int().min(0).max(10).optional(),
  perimetreCranienCm: z.number().positive().optional(),
  reanimationNouveauNe: z.boolean().optional(),
  complicationsAccouchement: z.string().trim().optional(),
  episiotomie: z.boolean().optional(),
  placentaComplet: z.boolean().optional(),

  // CPoN
  cponNumeroVisite: z.number().int().positive().optional(),
  joursPostPartum: z.number().int().min(0).optional(),
  etatPerinee: z.enum(['Normal', 'Déhiscence', 'Infecté']).optional(),
  allaitement: z.enum(['Exclusif', 'Mixte', 'Aucun']).optional(),
  planificationFamiliale: z.string().trim().optional(),
  etatNouveauNeCpon: z.string().trim().optional(),
  vaccinationBcgFait: z.boolean().optional(),
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

    const { id: patientId } = await ctx.params;

    const parsed = CreateMaterniteBody.safeParse(await req.json().catch(() => null));
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

    const d = parsed.data;
    const registerType = REGISTER_TYPE_BY_MATERNITE_TYPE[d.type];
    if (
      registerType &&
      (await isMonthClosed(prisma, auth.orgMember.organizationId, registerType, new Date()))
    ) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
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

    const maternite = await prisma.maternite.create({
      data: {
        patientId,
        providerId: auth.user.sub,
        type: d.type,
        ...(d.gestite !== undefined ? { gestite: d.gestite } : {}),
        ...(d.parite !== undefined ? { parite: d.parite } : {}),
        ...(d.dpa !== undefined ? { dpa: d.dpa } : {}),
        ...(d.ddr !== undefined ? { ddr: d.ddr } : {}),
        ...(d.observations ? { observations: d.observations } : {}),

        ...(d.cpnNumeroVisite !== undefined ? { cpnNumeroVisite: d.cpnNumeroVisite } : {}),
        ...(d.ageGestationnelSemaines !== undefined
          ? { ageGestationnelSemaines: d.ageGestationnelSemaines }
          : {}),
        ...(d.poidsKg !== undefined ? { poidsKg: d.poidsKg } : {}),
        ...(d.tensionArterielle ? { tensionArterielle: d.tensionArterielle } : {}),
        ...(d.hauteurUterineCm !== undefined ? { hauteurUterineCm: d.hauteurUterineCm } : {}),
        ...(d.bruitsCoeurFoetal ? { bruitsCoeurFoetal: d.bruitsCoeurFoetal } : {}),
        ...(d.mouvementsFoetaux ? { mouvementsFoetaux: d.mouvementsFoetaux } : {}),
        ...(d.oedemes !== undefined ? { oedemes: d.oedemes } : {}),
        ...(d.tpiDose !== undefined ? { tpiDose: d.tpiDose } : {}),
        ...(d.moustiquaireImpregnee !== undefined
          ? { moustiquaireImpregnee: d.moustiquaireImpregnee }
          : {}),
        ...(d.vatDose !== undefined ? { vatDose: d.vatDose } : {}),
        ...(d.ferAcideFolique !== undefined ? { ferAcideFolique: d.ferAcideFolique } : {}),
        ...(d.albuminurie ? { albuminurie: d.albuminurie } : {}),
        ...(d.glycosurie ? { glycosurie: d.glycosurie } : {}),
        ...(d.vih ? { vih: d.vih } : {}),
        ...(d.prochainRdv !== undefined ? { prochainRdv: d.prochainRdv } : {}),

        ...(d.modeAccouchement ? { modeAccouchement: d.modeAccouchement } : {}),
        ...(d.dureeTravailHeures !== undefined ? { dureeTravailHeures: d.dureeTravailHeures } : {}),
        ...(d.assistePar ? { assistePar: d.assistePar } : {}),
        ...(d.issueGrossesse ? { issueGrossesse: d.issueGrossesse } : {}),
        ...(d.sexeNouveauNe ? { sexeNouveauNe: d.sexeNouveauNe } : {}),
        ...(d.poidsNaissanceG !== undefined ? { poidsNaissanceG: d.poidsNaissanceG } : {}),
        ...(d.apgar1min !== undefined ? { apgar1min: d.apgar1min } : {}),
        ...(d.apgar5min !== undefined ? { apgar5min: d.apgar5min } : {}),
        ...(d.perimetreCranienCm !== undefined ? { perimetreCranienCm: d.perimetreCranienCm } : {}),
        ...(d.reanimationNouveauNe !== undefined
          ? { reanimationNouveauNe: d.reanimationNouveauNe }
          : {}),
        ...(d.complicationsAccouchement
          ? { complicationsAccouchement: d.complicationsAccouchement }
          : {}),
        ...(d.episiotomie !== undefined ? { episiotomie: d.episiotomie } : {}),
        ...(d.placentaComplet !== undefined ? { placentaComplet: d.placentaComplet } : {}),

        ...(d.cponNumeroVisite !== undefined ? { cponNumeroVisite: d.cponNumeroVisite } : {}),
        ...(d.joursPostPartum !== undefined ? { joursPostPartum: d.joursPostPartum } : {}),
        ...(d.etatPerinee ? { etatPerinee: d.etatPerinee } : {}),
        ...(d.allaitement ? { allaitement: d.allaitement } : {}),
        ...(d.planificationFamiliale ? { planificationFamiliale: d.planificationFamiliale } : {}),
        ...(d.etatNouveauNeCpon ? { etatNouveauNeCpon: d.etatNouveauNeCpon } : {}),
        ...(d.vaccinationBcgFait !== undefined ? { vaccinationBcgFait: d.vaccinationBcgFait } : {}),
      },
    });

    return NextResponse.json(
      {
        id: maternite.id,
        patientId: maternite.patientId,
        date: maternite.date.toISOString(),
        type: maternite.type,
      },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
