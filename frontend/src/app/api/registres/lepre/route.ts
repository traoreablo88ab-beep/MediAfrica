// GET /api/registres/lepre?month=2026-01 — read the manually-entered "Prise
// en charge Lèpre" counters for a month (RMA section 5, juste avant
// Dracunculose/Paludisme). Comme HygieneRapport, ce n'est PAS un journal par
// patient : un seul enregistrement par organisation+mois (cohorte PB/MB en
// début/fin de période, nouveaux cas, fermetures de fiche, infirmités,
// ruptures de médicaments), saisi manuellement en fin de mois — aucun champ
// de ce type n'existe ailleurs dans MediAfrica pour en dériver la valeur.
// Returns an all-null shape if the month has never been filled in.
//
// PUT /api/registres/lepre — create-or-update (upsert) that month's record.
// Refuses with REGISTER_CLOSED once the month has been closed via POST
// /api/registres/lepre/close (see lib/server/registers/closure.ts —
// registerType 'lepre', same generic helper every other register uses).
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

const REGISTER_TYPE = 'lepre';

// 27 compteurs du RMA section 5 (Prise en charge Lèpre), regroupés par les
// 5 sous-parties officielles (voir frontend/prisma/schema.prisma, model
// LepreRapport, pour le mapping libellé → nom de champ qui fait foi). Même
// liste dupliquée côté formulaire (frontend/src/app/registres/lepre/page.tsx)
// pour l'affichage groupé — même précédent que HYGIENE_FIELD_KEYS.
const LEPRE_FIELD_KEYS = [
  // Malades en traitement au début de la période
  'nbMaladesTraitementDebutPeriode',
  'nbMaladesTraitementDebutPeriodePB',
  'nbMaladesTraitementDebutPeriodeMB',
  // Nouveaux cas pris en charge (ouverture d'une fiche)
  'nbNouveauxCasPrisEnCharge',
  'nbNouveauxCasPB',
  'nbNouveauxCasMB',
  'nbNouveauxCasEnfantsMoins15Ans',
  'nbMutilationNouveauxCasPB',
  'nbMutilationNouveauxCasMB',
  'nbAutresCasRecusPB',
  'nbAutresCasRecusMB',
  // Traitements arrêtés (fermeture d'une fiche)
  'nbTraitementsArretes',
  'nbGuerisonPB',
  'nbGuerisonMB',
  'nbDecesPB',
  'nbDecesMB',
  'nbTransfertAutreFormationPB',
  'nbTransfertAutreFormationMB',
  'nbPerdusDeVuePB',
  'nbPerdusDeVueMB',
  // Malades à la fin de la période
  'nbMaladesFinPeriode',
  'nbMaladesFinPeriodePB',
  'nbMaladesFinPeriodeMB',
  // Infirmités et ruptures de stock
  'nbNouvellesInfirmitesDurantTraitement',
  'nbNouveauCasInfirmiteDegre2',
  'nbJoursRuptureMedicamentsPB',
  'nbJoursRuptureMedicamentsMB',
] as const;

type LepreFieldKey = (typeof LEPRE_FIELD_KEYS)[number];

const lepreFieldsShape = Object.fromEntries(
  LEPRE_FIELD_KEYS.map((k) => [k, z.number().int().nonnegative().optional()]),
) as Record<LepreFieldKey, z.ZodOptional<z.ZodNumber>>;

const LepreBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ...lepreFieldsShape,
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

    const rapport = await prisma.lepreRapport.findUnique({
      where: { organizationId_month: { organizationId: auth.orgMember.organizationId, month } },
    });

    const fields = Object.fromEntries(
      LEPRE_FIELD_KEYS.map((k) => [k, rapport?.[k] ?? null]),
    ) as Record<LepreFieldKey, number | null>;

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

    const parsed = LepreBody.safeParse(await req.json().catch(() => null));
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
    // même précédent que le registre Hygiène.
    const [yearStr, monthStr] = month.split('-');
    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    if (await isMonthClosed(prisma, organizationId, REGISTER_TYPE, monthDate)) {
      return NextResponse.json(
        { error: 'REGISTER_CLOSED', message: 'The lèpre register for this month is closed.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = Object.fromEntries(
      LEPRE_FIELD_KEYS.filter((k) => parsed.data[k] !== undefined).map((k) => [k, parsed.data[k]]),
    ) as Partial<Record<LepreFieldKey, number>>;

    const rapport = await prisma.lepreRapport.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: { organizationId, month, updatedById: auth.user.sub, ...data },
      update: { updatedById: auth.user.sub, ...data },
    });

    const fields = Object.fromEntries(
      LEPRE_FIELD_KEYS.map((k) => [k, rapport[k] ?? null]),
    ) as Record<LepreFieldKey, number | null>;

    return NextResponse.json(
      { month: rapport.month, ...fields },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
