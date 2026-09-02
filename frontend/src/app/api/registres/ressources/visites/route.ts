// GET /api/registres/ressources/visites?month=2026-01 — read the 5 CSCom
// supervision/meeting tables (visites de supervision district, autres
// visites, supervision CSCom, monitorage, réunions du conseil
// d'administration) for a month. No canonical seed rows — these are open
// lists (add/remove rows freely each month) — GET simply returns whatever
// VisiteReunionLine rows already exist, grouped by tableau. CSRéf has no
// equivalent (its Section 1 is just 3 yes/no questions on RessourcesRapport).
//
// PUT /api/registres/ressources/visites — bulk upsert in one transaction
// (motif StockLine), plus deletion of any row absent from the payload (free
// list, same semantics as PersonnelLine's CSCom rows). tableau must be one
// of the 5 canonical table keys; itemKey is a client-generated row id.
// Refuses with REGISTER_CLOSED once the shared 'ressources' registerType has
// been closed for that month.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed, monthKey } from '@/lib/server/registers/closure';
import { VISITE_TABLEAUX } from '@/lib/server/registers/ressources-items';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'ressources';

const TABLEAU_KEYS = new Set(VISITE_TABLEAUX.map((t) => t.key));
const TableauParam = z.enum(VISITE_TABLEAUX.map((t) => t.key) as [string, ...string[]]);

const VisiteLineInput = z.object({
  tableau: TableauParam,
  itemKey: z.string().min(1).max(120),
  type: z.string().max(200).optional(),
  datePrevue: z.string().max(40).optional(),
  dateRealisation: z.string().max(40).optional(),
  nombreJours: z.number().int().nonnegative().optional(),
  integreeOuSpecifique: z.string().max(200).optional(),
  numeroCompteRendu: z.string().max(200).optional(),
  decision1: z.string().max(500).optional(),
  decision2: z.string().max(500).optional(),
});

type VisiteLineFields = Omit<z.infer<typeof VisiteLineInput>, 'tableau' | 'itemKey'>;

const VISITE_LINE_FIELD_KEYS = [
  'type',
  'datePrevue',
  'dateRealisation',
  'nombreJours',
  'integreeOuSpecifique',
  'numeroCompteRendu',
  'decision1',
  'decision2',
] as const satisfies readonly (keyof VisiteLineFields)[];

const VisiteBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  lines: z.array(VisiteLineInput).max(200),
});

type LineFieldsRecord = Record<(typeof VISITE_LINE_FIELD_KEYS)[number], number | string | null>;

function toResponseLine(row: Record<string, unknown>) {
  const fields = Object.fromEntries(
    VISITE_LINE_FIELD_KEYS.map((k) => [k, row[k] ?? null]),
  ) as LineFieldsRecord;
  return { tableau: row.tableau as string, itemKey: row.itemKey as string, ...fields };
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

    const rows = await prisma.visiteReunionLine.findMany({
      where: { organizationId: auth.orgMember.organizationId, month },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(
      { month, lines: rows.map(toResponseLine) },
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

    const parsed = VisiteBody.safeParse(await req.json().catch(() => null));
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

    const unknownTableau = parsed.data.lines.find((l) => !TABLEAU_KEYS.has(l.tableau));
    if (unknownTableau) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Unknown tableau: ${unknownTableau.tableau}` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const organizationId = auth.orgMember.organizationId;
    const { month, lines } = parsed.data;

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
          VISITE_LINE_FIELD_KEYS.filter((k) => line[k] !== undefined).map((k) => [k, line[k]]),
        );
        await tx.visiteReunionLine.upsert({
          where: { organizationId_month_itemKey: { organizationId, month, itemKey: line.itemKey } },
          create: {
            organizationId,
            month,
            tableau: line.tableau,
            itemKey: line.itemKey,
            updatedById: auth.user.sub,
            ...data,
          },
          update: { tableau: line.tableau, updatedById: auth.user.sub, ...data },
        });
      }

      // Open list — any row absent from this PUT's payload was removed
      // client-side, so it is deleted here rather than left orphaned (same
      // reasoning as PersonnelLine's free-form CSCom rows).
      const submittedKeys = lines.map((l) => l.itemKey);
      await tx.visiteReunionLine.deleteMany({
        where: {
          organizationId,
          month,
          ...(submittedKeys.length > 0 ? { itemKey: { notIn: submittedKeys } } : {}),
        },
      });
    });

    const rows = await prisma.visiteReunionLine.findMany({
      where: { organizationId, month },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(
      { month, lines: rows.map(toResponseLine) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
