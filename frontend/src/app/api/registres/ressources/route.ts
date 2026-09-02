// GET /api/registres/ressources?month=2026-01 — read the manually-entered
// RMA sections 1 (fonctionnement/décentralisation) + 2 (source d'énergie,
// bilans financiers) + section 3 "Provenance et circonstances de prise en
// charge" (CSRéf) counters for a month. One record per organization+month,
// same non-clinical manual-entry shape as LaboratoireRapport — mixed
// Boolean/String/Int/Float fields (unlike the all-Int Lèpre/Hygiène/
// Laboratoire models), since this covers yes/no questions and financial
// amounts, not just headcounts. Returns an all-null shape if never filled.
//
// PUT /api/registres/ressources — create-or-update (upsert) that month's
// record. Refuses with REGISTER_CLOSED once the month has been closed via
// POST /api/registres/ressources/close — registerType 'ressources' is
// shared by this route and the sibling personnel/equipement/visites routes,
// so closing locks all four sub-resources together.
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

const REGISTER_TYPE = 'ressources';

const BOOLEAN_FIELD_KEYS = [
  'csrefAppuiConseilCercle',
  'csrefConseilGestionTenu',
  'cscomAsacoSubventionMairie',
  'cscomAsacoConventionSignee',
  'energieEdm',
  'energieGroupeElectrogene',
  'energieSolaire',
] as const;

const STRING_FIELD_KEYS = ['csrefAutreAppui'] as const;

const FLOAT_FIELD_KEYS = ['medIndicateurMaintien'] as const;

const INT_FIELD_KEYS = [
  // Section 1 — CSCom
  'cscomNbJoursFermeture',
  'cscomNbReunionsConseilAdmin',
  'cscomCaHommes',
  'cscomCaFemmes',
  'cscomComiteGestionHommes',
  'cscomComiteGestionFemmes',
  // Section 3 — Provenance et circonstances de prise en charge (CSRéf)
  'provenanceCurativeReferesAdresses',
  'provenanceCurativeReferesPrisEnCharge',
  'provenanceCurativeEvacuesAdresses',
  'provenanceCurativeEvacuesPrisEnCharge',
  'provenanceGrossesseReferesAdresses',
  'provenanceGrossesseReferesPrisEnCharge',
  'provenanceGrossesseEvacuesAdresses',
  'provenanceGrossesseEvacuesPrisEnCharge',
  'provenancePfReferesAdresses',
  'provenancePfReferesPrisEnCharge',
  'provenancePfEvacuesAdresses',
  'provenancePfEvacuesPrisEnCharge',
  // Bilan financier — Laboratoire
  'laboFinancierRecettesAttendues',
  'laboFinancierRecettesVersees',
  'laboFinancierDepenses',
  'laboFinancierSolde',
  // Bilan financier — Hors médicaments (CSRéf)
  'csrefHorsMedSoldeDebut',
  'csrefHorsMedTotalRecettes',
  'csrefHorsMedTotalDepenses',
  'csrefHorsMedSoldeFin',
  // Bilan financier — Hors médicaments (CSCom)
  'cscomHorsMedBanqueDebut',
  'cscomHorsMedCaisseDebut',
  'cscomHorsMedRecTarification',
  'cscomHorsMedRecTransfertCaisseMed',
  'cscomHorsMedRecCotisations',
  'cscomHorsMedRecReferenceEvacuation',
  'cscomHorsMedRecCarteAdhesion',
  'cscomHorsMedRecAutres',
  'cscomHorsMedDepSalaires',
  'cscomHorsMedDepAutresFonctionnement',
  'cscomHorsMedBanqueFin',
  'cscomHorsMedCaisseFin',
  // Bilan financier — Médicaments
  'medCapitalInitial',
  'medValeurFinPeriode',
  'medBanqueDebut',
  'medCaisseFin',
  'medCreancesFin',
  'medDettesFin',
  'medCapitalFin',
  // Compte d'exploitation médicaments
  'compteValeurDebut',
  'compteValeurFin',
  'compteVariationStock',
  'compteAchatMedicaments',
  'compteAppuiTarification',
  'compteSalairesGerant',
  'compteAutresFonctionnement',
  'compteTotalCharges',
  'compteRecettesVenteMed',
  'compteAutresRecettes',
  'compteTotalRecettes',
  'compteResultat',
] as const;

const RESSOURCES_FIELD_KEYS = [
  ...BOOLEAN_FIELD_KEYS,
  ...STRING_FIELD_KEYS,
  ...FLOAT_FIELD_KEYS,
  ...INT_FIELD_KEYS,
] as const;

type RessourcesFieldKey = (typeof RESSOURCES_FIELD_KEYS)[number];

// Builds a { [key]: schema } shape from a tuple of literal keys, keeping the
// keys' literal types (unlike Object.fromEntries(...).map(...) which widens
// to a string-indexed object) so z.object()/z.infer below stay precisely
// typed per field instead of collapsing every field to the same union.
function shapeFor<K extends string, S extends z.ZodTypeAny>(
  keys: readonly K[],
  schema: S,
): Record<K, S> {
  return Object.fromEntries(keys.map((k) => [k, schema])) as Record<K, S>;
}

const RessourcesBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ...shapeFor(BOOLEAN_FIELD_KEYS, z.boolean().optional()),
  ...shapeFor(STRING_FIELD_KEYS, z.string().max(500).optional()),
  ...shapeFor(FLOAT_FIELD_KEYS, z.number().finite().optional()),
  ...shapeFor(INT_FIELD_KEYS, z.number().int().optional()),
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

    const rapport = await prisma.ressourcesRapport.findUnique({
      where: { organizationId_month: { organizationId: auth.orgMember.organizationId, month } },
    });

    const fields = Object.fromEntries(
      RESSOURCES_FIELD_KEYS.map((k) => [k, rapport?.[k] ?? null]),
    ) as Record<RessourcesFieldKey, boolean | string | number | null>;

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

    const parsed = RessourcesBody.safeParse(await req.json().catch(() => null));
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
    const body = parsed.data;
    const { month } = body;

    const [yearStr, monthStr] = month.split('-');
    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    if (await isMonthClosed(prisma, organizationId, REGISTER_TYPE, monthDate)) {
      return NextResponse.json(
        { error: 'REGISTER_CLOSED', message: 'The ressources register for this month is closed.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Built per field-type group (not over the merged RESSOURCES_FIELD_KEYS
    // list) so each key keeps its own concrete type instead of collapsing
    // into one boolean|string|number union — Prisma's generated input types
    // reject that blanket union under exactOptionalPropertyTypes.
    function pick<K extends string, T>(keys: readonly K[]): Partial<Record<K, T>> {
      return Object.fromEntries(
        keys
          .filter((k) => body[k as RessourcesFieldKey] !== undefined)
          .map((k) => [k, body[k as RessourcesFieldKey]]),
      ) as Partial<Record<K, T>>;
    }
    const data = {
      ...pick<(typeof BOOLEAN_FIELD_KEYS)[number], boolean>(BOOLEAN_FIELD_KEYS),
      ...pick<(typeof STRING_FIELD_KEYS)[number], string>(STRING_FIELD_KEYS),
      ...pick<(typeof FLOAT_FIELD_KEYS)[number], number>(FLOAT_FIELD_KEYS),
      ...pick<(typeof INT_FIELD_KEYS)[number], number>(INT_FIELD_KEYS),
    };

    const rapport = await prisma.ressourcesRapport.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: { organizationId, month, updatedById: auth.user.sub, ...data },
      update: { updatedById: auth.user.sub, ...data },
    });

    const fields = Object.fromEntries(
      RESSOURCES_FIELD_KEYS.map((k) => [k, rapport[k] ?? null]),
    ) as Record<RessourcesFieldKey, boolean | string | number | null>;

    return NextResponse.json(
      { month: rapport.month, ...fields },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
