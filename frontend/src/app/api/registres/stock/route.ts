// GET /api/registres/stock?month=2026-01 — read the manually-entered
// "Gestion des stocks" ledger for a month (RMA section 6: médicaments du
// panier/PF/Paludisme/SMI, intrants de nutrition, vaccins et consommables).
// Contrairement à Lèpre/Hygiène/Laboratoire (un enregistrement plat par
// organisation+mois), Stock est une TABLE ENFANT — une ligne StockLine par
// (organisation, mois, article), l'article étant identifié par un itemKey
// stable défini dans lib/server/registers/stock-items.ts (~111 articles
// canoniques). Reproduire le grand livre complet en colonnes à plat
// donnerait ~900 colonnes sur un seul modèle ; voir STOCK_ITEMS pour la
// liste faisant foi. Une ligne absente en base revient avec des valeurs
// null (mois jamais rempli pour cet article).
//
// PUT /api/registres/stock — upsert en une seule transaction pour toutes
// les lignes envoyées (pas un aller-retour par article). Refuse avec
// REGISTER_CLOSED une fois le mois clôturé via POST
// /api/registres/stock/close (registerType 'stock').
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, monthKey } from '@/lib/server/registers/closure';
import { STOCK_ITEMS, type StockItem } from '@/lib/server/registers/stock-items';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'stock';

const STOCK_ITEM_BY_KEY = new Map<string, StockItem>(STOCK_ITEMS.map((i) => [i.key, i]));

// Colonnes communes à toutes les catégories, plus les 7 colonnes propres à
// category="vaccins" (nb: le nom générique quantiteRecue/quantiteAjustee/
// quantiteFin est réutilisé pour les vaccins — seul le libellé affiché
// change côté page, pas la structure — voir le commentaire sur le modèle
// StockLine dans schema.prisma).
const StockLineInput = z.object({
  itemKey: z.string(),
  quantiteDebut: z.number().int().nonnegative().optional(),
  quantiteRecue: z.number().int().nonnegative().optional(),
  consommation: z.number().int().nonnegative().optional(),
  quantiteAjustee: z.number().int().nonnegative().optional(),
  raisonsAjustement: z.string().max(500).optional(),
  joursRuptureStock: z.number().int().nonnegative().optional(),
  raisonsRupture: z.string().max(500).optional(),
  quantiteFin: z.number().int().nonnegative().optional(),
  quantiteCommandee: z.number().int().nonnegative().optional(),
  raisonsMiseAJour: z.string().max(500).optional(),
  // category="vaccins" uniquement
  perduPcvViree: z.number().int().nonnegative().optional(),
  perduCongele: z.number().int().nonnegative().optional(),
  perduPerime: z.number().int().nonnegative().optional(),
  perduCasse: z.number().int().nonnegative().optional(),
  perduAutresAvaries: z.number().int().nonnegative().optional(),
  datePeremption: z.string().max(40).optional(),
  numeroLot: z.string().max(80).optional(),
});

type StockLineFields = Omit<z.infer<typeof StockLineInput>, 'itemKey'>;

const STOCK_LINE_FIELD_KEYS = [
  'quantiteDebut',
  'quantiteRecue',
  'consommation',
  'quantiteAjustee',
  'raisonsAjustement',
  'joursRuptureStock',
  'raisonsRupture',
  'quantiteFin',
  'quantiteCommandee',
  'raisonsMiseAJour',
  'perduPcvViree',
  'perduCongele',
  'perduPerime',
  'perduCasse',
  'perduAutresAvaries',
  'datePeremption',
  'numeroLot',
] as const satisfies readonly (keyof StockLineFields)[];

const StockBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  lines: z.array(StockLineInput).max(STOCK_ITEMS.length),
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

    const rows = await prisma.stockLine.findMany({
      where: { organizationId: auth.orgMember.organizationId, month },
    });
    const rowByKey = new Map(rows.map((r) => [r.itemKey, r]));

    const lines = STOCK_ITEMS.map((item) => {
      const row = rowByKey.get(item.key);
      const fields = Object.fromEntries(
        STOCK_LINE_FIELD_KEYS.map((k) => [k, row?.[k] ?? null]),
      ) as Record<(typeof STOCK_LINE_FIELD_KEYS)[number], number | string | null>;
      return { itemKey: item.key, category: item.category, ...fields };
    });

    return NextResponse.json({ month, lines }, { headers: { 'x-request-id': ctx.requestId } });
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

    const parsed = StockBody.safeParse(await req.json().catch(() => null));
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

    const unknownKey = parsed.data.lines.find((l) => !STOCK_ITEM_BY_KEY.has(l.itemKey));
    if (unknownKey) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Unknown itemKey: ${unknownKey.itemKey}` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const organizationId = auth.orgMember.organizationId;
    const { month, lines } = parsed.data;

    // Construction par composants locaux (pas via chaîne ISO), même
    // précédent que Lèpre/Hygiène/Laboratoire — voir leurs routes.
    const [yearStr, monthStr] = month.split('-');
    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    if (await isMonthClosed(prisma, organizationId, REGISTER_TYPE, monthDate)) {
      return NextResponse.json(
        { error: 'REGISTER_CLOSED', message: 'The stock register for this month is closed.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Un aller-retour DB pour toute la grille (jusqu'à ~111 lignes), pas un
    // par article — cohérent avec le bouton "Enregistrer" unique de la page.
    // Forme "callback" (pas la forme tableau) — même précédent que
    // patients/route.ts, seul autre usage de $transaction dans ce repo.
    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const item = STOCK_ITEM_BY_KEY.get(line.itemKey)!;
        const data = Object.fromEntries(
          STOCK_LINE_FIELD_KEYS.filter((k) => line[k] !== undefined).map((k) => [k, line[k]]),
        );
        await tx.stockLine.upsert({
          where: { organizationId_month_itemKey: { organizationId, month, itemKey: item.key } },
          create: {
            organizationId,
            month,
            itemKey: item.key,
            category: item.category,
            updatedById: auth.user.sub,
            ...data,
          },
          update: { updatedById: auth.user.sub, ...data },
        });
      }
    });

    const rows = await prisma.stockLine.findMany({ where: { organizationId, month } });
    const rowByKey = new Map(rows.map((r) => [r.itemKey, r]));
    const responseLines = STOCK_ITEMS.map((item) => {
      const row = rowByKey.get(item.key);
      const fields = Object.fromEntries(
        STOCK_LINE_FIELD_KEYS.map((k) => [k, row?.[k] ?? null]),
      ) as Record<(typeof STOCK_LINE_FIELD_KEYS)[number], number | string | null>;
      return { itemKey: item.key, category: item.category, ...fields };
    });

    return NextResponse.json(
      { month, lines: responseLines },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
