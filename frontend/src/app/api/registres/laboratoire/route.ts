// GET /api/registres/laboratoire?month=2026-01 — read the manually-entered
// "Activités de laboratoire et transfusion" counters for a month (RMA
// section 4). Comme Lèpre/Hygiène, ce n'est PAS un journal par patient : un
// seul enregistrement par organisation+mois (colonnes Total + Positif/
// Anormal par examen), saisi manuellement en fin de mois — aucun champ de ce
// type n'existe ailleurs dans MediAfrica pour en dériver la valeur. Les
// champs Imagerie/Anesthésie sont propres au 2ème échelon/CSRéf, restent
// null côté CSCom. Returns an all-null shape if the month has never been
// filled in.
//
// PUT /api/registres/laboratoire — create-or-update (upsert) that month's
// record. Refuses with REGISTER_CLOSED once the month has been closed via
// POST /api/registres/laboratoire/close (see lib/server/registers/closure.ts
// — registerType 'laboratoire', same generic helper every other register
// uses).
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

const REGISTER_TYPE = 'laboratoire';

// 84 compteurs du RMA section 4 (Activités de laboratoire et transfusion),
// regroupés par les 7 sous-parties officielles (voir
// frontend/prisma/schema.prisma, model LaboratoireRapport, pour le mapping
// libellé → nom de champ qui fait foi). Même liste dupliquée côté formulaire
// (frontend/src/app/registres/laboratoire/page.tsx) pour l'affichage groupé
// — même précédent que LEPRE_FIELD_KEYS/HYGIENE_FIELD_KEYS.
const LABORATOIRE_FIELD_KEYS = [
  // Hématologie
  'nfsTotal',
  'nfsPositif',
  'vsTotal',
  'vsPositif',
  'tsTotal',
  'tsPositif',
  'tcTotal',
  'tcPositif',
  'teTotal',
  'tePositif',
  'groupeAboTotal',
  'groupeAboPositif',
  'rhesusDTotal',
  'rhesusDPositif',
  // Sérologie
  'hbsTotal',
  'hbsPositif',
  'bwTotal',
  'bwPositif',
  'widalTotal',
  'widalPositif',
  'vihTotal',
  'vihPositif',
  'transfusionPocheTesteeTotal',
  'transfusionPocheTesteePositif',
  'testGrossesseTotal',
  'testGrossessePositif',
  // Biochimie
  'glycemieTotal',
  'glycemieAnormal',
  'albumineTotal',
  'albumineAnormal',
  'sucreTotal',
  'sucreAnormal',
  'creatinemieTotal',
  'creatinemieAnormal',
  'transaminasesTotal',
  'transaminasesAnormal',
  'cholesterolemieTotal',
  'cholesterolemieAnormal',
  'asloTotal',
  'asloAnormal',
  'serologieToxoTotal',
  'serologieToxoAnormal',
  'serologieRubeoleTotal',
  'serologieRubeoleAnormal',
  'autresBiochimiesTotal',
  'autresBiochimiesAnormal',
  // Bactériologie
  'lcrTotal',
  'lcrPositif',
  'bkTotal',
  'bkPositif',
  'ecbuTotal',
  'ecbuPositif',
  'pvGramTotal',
  'pvGramPositif',
  'puGramTotal',
  'puGramPositif',
  'autreBacterioTotal',
  'autreBacterioPositif',
  // Parasitologie
  'geFrottisTotal',
  'geFrottisPositif',
  'tdrTotal',
  'tdrPositif',
  'culotUrinaireTotal',
  'culotUrinairePositif',
  'pokDirectTotal',
  'pokDirectPositif',
  'pokKatoTotal',
  'pokKatoPositif',
  'rechSchistoTotal',
  'rechSchistoPositif',
  'pvDirectTotal',
  'pvDirectPositif',
  'puDirectTotal',
  'puDirectPositif',
  'rechMicrofilairesTotal',
  'rechMicrofilairesPositif',
  // Transfusion (valeur unique)
  'nbPochesDisponibles',
  'nbPatientsTransfuses',
  // Imagerie médicale (CSRéf uniquement)
  'nbGraphiesRealisees',
  'nbEchographiesRealisees',
  'imagerieAutres',
  // Anesthésie (CSRéf uniquement)
  'anesthesieLocale',
  'anesthesieLocoRegionale',
  'anesthesieGenerale',
] as const;

type LaboratoireFieldKey = (typeof LABORATOIRE_FIELD_KEYS)[number];

const laboratoireFieldsShape = Object.fromEntries(
  LABORATOIRE_FIELD_KEYS.map((k) => [k, z.number().int().nonnegative().optional()]),
) as Record<LaboratoireFieldKey, z.ZodOptional<z.ZodNumber>>;

const LaboratoireBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ...laboratoireFieldsShape,
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

    const rapport = await prisma.laboratoireRapport.findUnique({
      where: { organizationId_month: { organizationId: auth.orgMember.organizationId, month } },
    });

    const fields = Object.fromEntries(
      LABORATOIRE_FIELD_KEYS.map((k) => [k, rapport?.[k] ?? null]),
    ) as Record<LaboratoireFieldKey, number | null>;

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

    const parsed = LaboratoireBody.safeParse(await req.json().catch(() => null));
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
    // même précédent que Lèpre/Hygiène.
    const [yearStr, monthStr] = month.split('-');
    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    if (await isMonthClosed(prisma, organizationId, REGISTER_TYPE, monthDate)) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The laboratoire register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = Object.fromEntries(
      LABORATOIRE_FIELD_KEYS.filter((k) => parsed.data[k] !== undefined).map((k) => [
        k,
        parsed.data[k],
      ]),
    ) as Partial<Record<LaboratoireFieldKey, number>>;

    const rapport = await prisma.laboratoireRapport.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: { organizationId, month, updatedById: auth.user.sub, ...data },
      update: { updatedById: auth.user.sub, ...data },
    });

    const fields = Object.fromEntries(
      LABORATOIRE_FIELD_KEYS.map((k) => [k, rapport[k] ?? null]),
    ) as Record<LaboratoireFieldKey, number | null>;

    return NextResponse.json(
      { month: rapport.month, ...fields },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
