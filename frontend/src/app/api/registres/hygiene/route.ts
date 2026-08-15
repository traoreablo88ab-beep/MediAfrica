// GET /api/registres/hygiene?month=2026-01 — read the manually-entered
// "Activités d'hygiène publique et salubrité" totals for a month (RMA
// section 7). Unlike every other register in this app, HygieneRapport is
// NOT a per-patient event log — it's a single record per organization+month
// of aggregate counters, entered by staff at month-end (no source data to
// derive it from). Returns an all-null shape if the month has never been
// filled in.
//
// PUT /api/registres/hygiene — create-or-update (upsert) that month's
// record. Refuses with REGISTER_CLOSED once the month has been closed via
// POST /api/registres/hygiene/close (see lib/server/registers/closure.ts —
// registerType 'hygiene', same generic helper every other register uses).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, monthKey } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'hygiene';

// 66 compteurs du RMA section 7, regroupés par les 7 sous-parties officielles
// (voir frontend/prisma/schema.prisma, model HygieneRapport, pour le mapping
// libellé → nom de champ qui fait foi). Même liste dupliquée côté formulaire
// (frontend/src/app/registres/hygiene/page.tsx) pour l'affichage groupé.
const HYGIENE_FIELD_KEYS = [
  // 1. Hygiène de l'eau
  'nbComparateursChlorePh',
  'nbNouveauxPuitsRealises',
  'nbPuitsExistants',
  'nbNouveauxPuitsAmenages',
  'nbPuitsTraites',
  'nbNouveauxForagesRealises',
  'nbForagesExistants',
  'nbNouveauxForagesAmenages',
  'nbForagesFonctionnels',
  'nbAesExistants',
  'nbAesChloreesAvantDistribution',
  'nbControlesChloreEffectues',
  'nbControlesChloreNormes',
  // 2. Hygiène de l'habitat et des établissements classés
  'nbVisitesDomicileEffectuees',
  'nbConcessionsSourceEauPotable',
  'nbConcessionsLatrines',
  'nbConcessionsLatrinesAmeliorees',
  'nbLatrinesDesinfectees',
  'nbConcessionsPuisard',
  'nbConcessionsDesinsectisees',
  'nbConcessionsDeratisees',
  'nbMenagesLavageMains',
  'nbEcolesPointEauPotable',
  'nbEcolesLavageMains',
  'nbEcolesLatrinesAmeliorees',
  // 3. Hygiène des aliments (restauration collective)
  'nbControlesIodationSel',
  'nbCasIntoxicationsAlimentaires',
  'nbTiacEnregistres',
  'nbEtabsRestaurationExistants',
  'nbEtabsRestaurationInspectes',
  'nbEtabsRestaurationConformes',
  'nbInspectionsSanitairesEffectuees',
  'nbVisitesMedicalesManipulateurs',
  // 4. Accès à l'eau potable, hygiène et assainissement (AEP)
  'nbSourcesEauExistantesCS',
  'nbSourcesEauFonctionnellesCS',
  'nbPointsDistributionFonctionnelsCS',
  'nbPointsDistributionExistantsCS',
  'nbReservoirsStockageExistantsCS',
  'nbReservoirsStockageFonctionnelsCS',
  'nbControlesChloreCS',
  'nbControlesChloreNormesCS',
  // 5. Gestion des eaux usées et excréta
  'nbToilettesExistantesCS',
  'nbToilettesFonctionnellesCS',
  'nbToilettesSepareesCS',
  'nbToilettesHandicapCS',
  'nbToilettesLavageMainsCS',
  'nbDispositifsTraitementExistants',
  'nbDispositifsTraitementFonctionnels',
  // 6. Gestion des déchets biomédicaux
  'nbKitsProtectionExistants',
  'nbUnitesSoinsTotal',
  'nbUnitesSoinsTriSource',
  'nbCsIncinerateurFonctionnel',
  'nbBoitesSecuriteCollectees',
  'nbBoitesSecuriteConvoyees',
  'nbBoitesSecuriteIncinerees',
  // 7. Prévention/contrôle des infections + promotion de l'hygiène
  'nbUnitesSoinsLavageMainsFonctionnel',
  'nbPersonnelEquipementProtection',
  'nbPersonnelTotal',
  'nbUnitesProduitsEntretien',
  'nbAppareilsSterilisationExistants',
  'nbAppareilsSterilisationFonctionnels',
  'nbComitesHygieneSalubrite',
  'nbComitesHygieneSalubriteFonctionnels',
  'nbAteliersConfectionDalles',
  'nbSeancesSensibilisationRealisees',
  'nbSeancesSensibilisationPlanifiees',
] as const;

type HygieneFieldKey = (typeof HYGIENE_FIELD_KEYS)[number];

const hygieneFieldsShape = Object.fromEntries(
  HYGIENE_FIELD_KEYS.map((k) => [k, z.number().int().nonnegative().optional()]),
) as Record<HygieneFieldKey, z.ZodOptional<z.ZodNumber>>;

const HygieneBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ...hygieneFieldsShape,
});

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

    const monthParam = req.nextUrl.searchParams.get('month');
    const month = monthParam ?? monthKey(new Date());

    const rapport = await prisma.hygieneRapport.findUnique({
      where: { organizationId_month: { organizationId: auth.orgMember.organizationId, month } },
    });

    const fields = Object.fromEntries(
      HYGIENE_FIELD_KEYS.map((k) => [k, rapport?.[k] ?? null]),
    ) as Record<HygieneFieldKey, number | null>;

    return NextResponse.json({ month, ...fields }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
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

    const parsed = HygieneBody.safeParse(await req.json().catch(() => null));
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

    const organizationId = auth.orgMember.organizationId;
    const { month } = parsed.data;

    // Construction par composants locaux (pas via chaîne ISO) pour que
    // getFullYear()/getMonth() (utilisés par monthKey dans isMonthClosed)
    // retombent exactement sur `month`, sans dépendre du fuseau du serveur —
    // même précédent que monthStartAndNext() sur la page RMA.
    const [yearStr, monthStr] = month.split('-');
    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    if (await isMonthClosed(prisma, organizationId, REGISTER_TYPE, monthDate)) {
      return NextResponse.json(
        { error: 'REGISTER_CLOSED', message: 'The hygiène register for this month is closed.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = Object.fromEntries(
      HYGIENE_FIELD_KEYS.filter((k) => parsed.data[k] !== undefined).map((k) => [
        k,
        parsed.data[k],
      ]),
    ) as Partial<Record<HygieneFieldKey, number>>;

    const rapport = await prisma.hygieneRapport.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: { organizationId, month, updatedById: auth.user.sub, ...data },
      update: { updatedById: auth.user.sub, ...data },
    });

    const fields = Object.fromEntries(
      HYGIENE_FIELD_KEYS.map((k) => [k, rapport[k] ?? null]),
    ) as Record<HygieneFieldKey, number | null>;

    return NextResponse.json(
      { month: rapport.month, ...fields },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
