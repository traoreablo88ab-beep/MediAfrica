// GET /api/registres/ressources/equipement?month=2026-01&echelon=csref —
// read the equipment ledger (communication, véhicules, réfrigérateurs/
// congélateurs) for a month. Canonical list per echelon (EQUIPMENT_ITEMS,
// filtered by equipmentItemsFor()) merged with saved EquipmentLine rows —
// same merge pattern as StockLine. Missing items come back with null fields.
//
// PUT /api/registres/ressources/equipement — bulk upsert in one transaction
// (motif StockLine). itemKey must belong to the canonical list for that
// echelon. Refuses with REGISTER_CLOSED once the shared 'ressources'
// registerType has been closed for that month.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, monthKey } from '@/lib/server/registers/closure';
import { equipmentItemsFor, type EquipmentItem } from '@/lib/server/registers/ressources-items';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'ressources';

const EchelonParam = z.enum(['csref', 'cscom']);

const EquipmentLineInput = z.object({
  itemKey: z.string().min(1).max(120),
  nombreFonctionnel: z.number().int().nonnegative().optional(),
  nombreEnPanne: z.number().int().nonnegative().optional(),
  joursArretPanne: z.number().int().nonnegative().optional(),
  naturePanne: z.string().max(500).optional(),
  reparationsFaites: z.boolean().optional(),
  nombreRepare: z.number().int().nonnegative().optional(),
  tempMin8h: z.number().finite().optional(),
  tempMax8h: z.number().finite().optional(),
  nbAlarmeBasse8h: z.number().int().nonnegative().optional(),
  nbAlarmeHaute8h: z.number().int().nonnegative().optional(),
  tempMin14h: z.number().finite().optional(),
  tempMax14h: z.number().finite().optional(),
  nbAlarmeBasse14h: z.number().int().nonnegative().optional(),
  nbAlarmeHaute14h: z.number().int().nonnegative().optional(),
});

type EquipmentLineFields = Omit<z.infer<typeof EquipmentLineInput>, 'itemKey'>;

const EQUIPMENT_LINE_FIELD_KEYS = [
  'nombreFonctionnel',
  'nombreEnPanne',
  'joursArretPanne',
  'naturePanne',
  'reparationsFaites',
  'nombreRepare',
  'tempMin8h',
  'tempMax8h',
  'nbAlarmeBasse8h',
  'nbAlarmeHaute8h',
  'tempMin14h',
  'tempMax14h',
  'nbAlarmeBasse14h',
  'nbAlarmeHaute14h',
] as const satisfies readonly (keyof EquipmentLineFields)[];

const EquipmentBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  echelon: EchelonParam,
  lines: z.array(EquipmentLineInput).max(200),
});

type LineFieldsRecord = Record<
  (typeof EQUIPMENT_LINE_FIELD_KEYS)[number],
  number | string | boolean | null
>;

function toResponseLines(
  items: readonly EquipmentItem[],
  rowByKey: Map<string, Record<string, unknown>>,
) {
  return items.map((item) => {
    const row = rowByKey.get(item.key);
    const fields = Object.fromEntries(
      EQUIPMENT_LINE_FIELD_KEYS.map((k) => [k, row?.[k] ?? null]),
    ) as LineFieldsRecord;
    return { itemKey: item.key, label: item.label, category: item.category, ...fields };
  });
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

    const monthParam = req.nextUrl.searchParams.get('month');
    const month = monthParam ?? monthKey(new Date());
    const echelonParsed = EchelonParam.safeParse(req.nextUrl.searchParams.get('echelon'));
    if (!echelonParsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid or missing echelon' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const echelon = echelonParsed.data;
    const items = equipmentItemsFor(echelon);

    const rows = await prisma.equipmentLine.findMany({
      where: { organizationId: auth.orgMember.organizationId, month },
    });
    const rowByKey = new Map(rows.map((r) => [r.itemKey, r]));

    return NextResponse.json(
      { month, echelon, lines: toResponseLines(items, rowByKey) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
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

    const parsed = EquipmentBody.safeParse(await req.json().catch(() => null));
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

    const { month, echelon, lines } = parsed.data;
    const items = equipmentItemsFor(echelon);
    const itemByKey = new Map(items.map((i) => [i.key, i]));

    const unknownKey = lines.find((l) => !itemByKey.has(l.itemKey));
    if (unknownKey) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Unknown itemKey: ${unknownKey.itemKey}` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const organizationId = auth.orgMember.organizationId;

    const [yearStr, monthStr] = month.split('-');
    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    if (await isMonthClosed(prisma, organizationId, REGISTER_TYPE, monthDate)) {
      return NextResponse.json(
        { error: 'REGISTER_CLOSED', message: 'The ressources register for this month is closed.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const item = itemByKey.get(line.itemKey)!;
        const data = Object.fromEntries(
          EQUIPMENT_LINE_FIELD_KEYS.filter((k) => line[k] !== undefined).map((k) => [k, line[k]]),
        );
        await tx.equipmentLine.upsert({
          where: { organizationId_month_itemKey: { organizationId, month, itemKey: item.key } },
          create: {
            organizationId,
            month,
            category: item.category,
            itemKey: item.key,
            label: item.label,
            updatedById: auth.user.sub,
            ...data,
          },
          update: { updatedById: auth.user.sub, ...data },
        });
      }
    });

    const rows = await prisma.equipmentLine.findMany({ where: { organizationId, month } });
    const rowByKey = new Map(rows.map((r) => [r.itemKey, r]));

    return NextResponse.json(
      { month, echelon, lines: toResponseLines(items, rowByKey) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
