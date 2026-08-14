// GET /api/patients/[id] — full patient record + consultation history,
// maternité history (CPN/Accouchement only — CPoN stays scaffolded/hidden
// for V2/V3), nutrition history, vaccination history, hospitalisation
// history and planification familiale history, most recent 20 each,
// provider name included via relation.
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
const MATERNITE_HISTORY_LIMIT = 20;
const NUTRITION_HISTORY_LIMIT = 20;
const VACCINATION_HISTORY_LIMIT = 20;
const HOSPITALISATION_HISTORY_LIMIT = 20;
const PF_HISTORY_LIMIT = 20;

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
        maternites: {
          where: { type: { in: ['CPN', 'ACCOUCHEMENT'] } },
          orderBy: { date: 'desc' },
          take: MATERNITE_HISTORY_LIMIT,
          include: { provider: { select: { name: true } } },
        },
        nutritions: {
          orderBy: { date: 'desc' },
          take: NUTRITION_HISTORY_LIMIT,
          include: {
            provider: { select: { name: true } },
            visites: { orderBy: { numeroVisite: 'asc' } },
            evenements: { orderBy: { date: 'asc' } },
          },
        },
        vaccinations: {
          orderBy: { date: 'desc' },
          take: VACCINATION_HISTORY_LIMIT,
          include: { provider: { select: { name: true } } },
        },
        hospitalisations: {
          orderBy: { dateHeureEntree: 'desc' },
          take: HOSPITALISATION_HISTORY_LIMIT,
          include: { provider: { select: { name: true } } },
        },
        planificationsFamiliales: {
          orderBy: { date: 'desc' },
          take: PF_HISTORY_LIMIT,
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

    const {
      consultations,
      maternites,
      nutritions,
      vaccinations,
      hospitalisations,
      planificationsFamiliales,
      ...fields
    } = patient;
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
          indigent: c.indigent,
          telephoneContact: c.telephoneContact,
          localisationPrecise: c.localisationPrecise,
          providerName: c.provider?.name ?? null,
        })),
        maternites: maternites.map((m) => ({
          id: m.id,
          date: m.date.toISOString(),
          type: m.type,
          cpnNumeroVisite: m.cpnNumeroVisite,
          ageGestationnelSemaines: m.ageGestationnelSemaines,
          prochainRdv: m.prochainRdv?.toISOString() ?? null,
          modeAccouchement: m.modeAccouchement,
          issueGrossesse: m.issueGrossesse,
          sexeNouveauNe: m.sexeNouveauNe,
          poidsNaissanceG: m.poidsNaissanceG,
          observations: m.observations,
          indigent: m.indigent,
          telephoneContact: m.telephoneContact,
          localisationPrecise: m.localisationPrecise,
          providerName: m.provider?.name ?? null,
        })),
        nutritions: nutritions.map((n) => ({
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
          providerName: n.provider?.name ?? null,
        })),
        vaccinations: vaccinations.map((v) => ({
          id: v.id,
          date: v.date.toISOString(),
          antigene: v.antigene,
          numeroDose: v.numeroDose,
          siteInjection: v.siteInjection,
          dejaSousContraception: v.dejaSousContraception,
          methodeContraceptivePrecedente: v.methodeContraceptivePrecedente,
          pfppCounselingPropose: v.pfppCounselingPropose,
          methodePfAdoptee: v.methodePfAdoptee,
          conseilsAme: v.conseilsAme,
          pratiqueAme: v.pratiqueAme,
          prochainRdv: v.prochainRdv?.toISOString() ?? null,
          observations: v.observations,
          providerName: v.provider?.name ?? null,
        })),
        hospitalisations: hospitalisations.map((h) => ({
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
          traitementRecu: h.traitementRecu,
          dateHeureSortie: h.dateHeureSortie?.toISOString() ?? null,
          issue: h.issue,
          observations: h.observations,
          providerName: h.provider?.name ?? null,
        })),
        planificationsFamiliales: planificationsFamiliales.map((pf) => ({
          id: pf.id,
          date: pf.date.toISOString(),
          typeVisite: pf.typeVisite,
          methodeChoisie: pf.methodeChoisie,
          actionMethode: pf.actionMethode,
          nbreCyclesDistribues: pf.nbreCyclesDistribues,
          typeUtilisateur: pf.typeUtilisateur,
          ageDernierEnfantMois: pf.ageDernierEnfantMois,
          pratiqueAme: pf.pratiqueAme,
          enfantAJourVaccins: pf.enfantAJourVaccins,
          conseilsAlimentationComplement: pf.conseilsAlimentationComplement,
          serviceProvenance: pf.serviceProvenance,
          ppi: pf.ppi,
          prochainRdv: pf.prochainRdv?.toISOString() ?? null,
          observations: pf.observations,
          providerName: pf.provider?.name ?? null,
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
