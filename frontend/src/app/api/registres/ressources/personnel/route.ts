// GET /api/registres/ressources/personnel?month=2026-01&echelon=csref — read
// the personnel roster for a month. CSRéf uses a canonical list of job
// categories (PERSONNEL_CATEGORIES_CSREF, ~41 entries) merged with any saved
// PersonnelLine rows — missing categories come back with null fields, same
// merge pattern as StockLine. CSCom has no canonical list — the RMA 1er
// échelon lists staff individually, so GET simply returns whatever free-form
// rows already exist for that month+echelon (itemKey generated client-side).
//
// PUT /api/registres/ressources/personnel — bulk upsert in one transaction
// (motif StockLine). For echelon=csref, itemKey must be one of the canonical
// category keys. For echelon=cscom, itemKey is free-form (client-generated)
// but must be non-empty. Refuses with REGISTER_CLOSED once the shared
// 'ressources' registerType has been closed for that month.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, monthKey } from '@/lib/server/registers/closure';
import { PERSONNEL_CATEGORIES_CSREF } from '@/lib/server/registers/ressources-items';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'ressources';

const CSREF_KEYS = new Set(PERSONNEL_CATEGORIES_CSREF.map((c) => c.key));

const PersonnelLineInput = z.object({
  itemKey: z.string().min(1).max(120),
  qualification: z.string().min(1).max(200),
  sexe: z.string().max(1).optional(),
  fonctionResponsabilite: z.string().max(200).optional(),
  effectifOfficiel: z.number().int().nonnegative().optional(),
  priseEnChargeSalaire: z.string().max(200).optional(),
  absenceFormation: z.number().int().nonnegative().optional(),
  absenceRaisonsService: z.number().int().nonnegative().optional(),
  absenceRaisonsPersonnelles: z.number().int().nonnegative().optional(),
  absenceDureeTotale: z.number().int().nonnegative().optional(),
  observations: z.string().max(500).optional(),
});

type PersonnelLineFields = Omit<z.infer<typeof PersonnelLineInput>, 'itemKey' | 'qualification'>;

const PERSONNEL_LINE_FIELD_KEYS = [
  'sexe',
  'fonctionResponsabilite',
  'effectifOfficiel',
  'priseEnChargeSalaire',
  'absenceFormation',
  'absenceRaisonsService',
  'absenceRaisonsPersonnelles',
  'absenceDureeTotale',
  'observations',
] as const satisfies readonly (keyof PersonnelLineFields)[];

const EchelonParam = z.enum(['csref', 'cscom']);

const PersonnelBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  echelon: EchelonParam,
  lines: z.array(PersonnelLineInput).max(500),
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
    const echelonParsed = EchelonParam.safeParse(req.nextUrl.searchParams.get('echelon'));
    if (!echelonParsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid or missing echelon' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const echelon = echelonParsed.data;

    const rows = await prisma.personnelLine.findMany({
      where: { organizationId: auth.orgMember.organizationId, month, echelon },
    });
    const rowByKey = new Map(rows.map((r) => [r.itemKey, r]));

    const lines =
      echelon === 'csref'
        ? PERSONNEL_CATEGORIES_CSREF.map((cat) => {
            const row = rowByKey.get(cat.key);
            const fields = Object.fromEntries(
              PERSONNEL_LINE_FIELD_KEYS.map((k) => [k, row?.[k] ?? null]),
            ) as Record<(typeof PERSONNEL_LINE_FIELD_KEYS)[number], number | string | null>;
            return { itemKey: cat.key, qualification: cat.label, ...fields };
          })
        : rows.map((row) => {
            const fields = Object.fromEntries(
              PERSONNEL_LINE_FIELD_KEYS.map((k) => [k, row[k] ?? null]),
            ) as Record<(typeof PERSONNEL_LINE_FIELD_KEYS)[number], number | string | null>;
            return { itemKey: row.itemKey, qualification: row.qualification, ...fields };
          });

    return NextResponse.json(
      { month, echelon, lines },
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

    const parsed = PersonnelBody.safeParse(await req.json().catch(() => null));
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

    if (echelon === 'csref') {
      const unknownKey = lines.find((l) => !CSREF_KEYS.has(l.itemKey));
      if (unknownKey) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: `Unknown itemKey: ${unknownKey.itemKey}` },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
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
        const data = Object.fromEntries(
          PERSONNEL_LINE_FIELD_KEYS.filter((k) => line[k] !== undefined).map((k) => [k, line[k]]),
        );
        await tx.personnelLine.upsert({
          where: { organizationId_month_itemKey: { organizationId, month, itemKey: line.itemKey } },
          create: {
            organizationId,
            month,
            echelon,
            itemKey: line.itemKey,
            qualification: line.qualification,
            updatedById: auth.user.sub,
            ...data,
          },
          update: {
            qualification: line.qualification,
            updatedById: auth.user.sub,
            ...data,
          },
        });
      }

      // CSCom personnel is a free-form list (add/remove agents at will) — a
      // row absent from this PUT's payload was removed client-side, so it is
      // deleted here rather than left orphaned. CSRéf is a fixed canonical
      // list (categories are never added/removed), so no deletion there.
      if (echelon === 'cscom') {
        const submittedKeys = lines.map((l) => l.itemKey);
        await tx.personnelLine.deleteMany({
          where: {
            organizationId,
            month,
            echelon: 'cscom',
            ...(submittedKeys.length > 0 ? { itemKey: { notIn: submittedKeys } } : {}),
          },
        });
      }
    });

    const rows = await prisma.personnelLine.findMany({ where: { organizationId, month, echelon } });
    const rowByKey = new Map(rows.map((r) => [r.itemKey, r]));
    const responseLines =
      echelon === 'csref'
        ? PERSONNEL_CATEGORIES_CSREF.map((cat) => {
            const row = rowByKey.get(cat.key);
            const fields = Object.fromEntries(
              PERSONNEL_LINE_FIELD_KEYS.map((k) => [k, row?.[k] ?? null]),
            ) as Record<(typeof PERSONNEL_LINE_FIELD_KEYS)[number], number | string | null>;
            return { itemKey: cat.key, qualification: cat.label, ...fields };
          })
        : rows.map((row) => {
            const fields = Object.fromEntries(
              PERSONNEL_LINE_FIELD_KEYS.map((k) => [k, row[k] ?? null]),
            ) as Record<(typeof PERSONNEL_LINE_FIELD_KEYS)[number], number | string | null>;
            return { itemKey: row.itemKey, qualification: row.qualification, ...fields };
          });

    return NextResponse.json(
      { month, echelon, lines: responseLines },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
