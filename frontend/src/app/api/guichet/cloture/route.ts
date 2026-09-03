// POST /api/guichet/cloture — a guichetier closes their own shift for a
// given day (defaults to today). recetteTheorique is always server-computed
// (Σ montant of that guichetier's "emise" transactions for the day, per
// .planning/prd-guichet-entree.md § 4.4/5.1) — never accepted from the
// client, same anti-fraud principle as transaction emission. recetteRemise
// is the physically-counted amount the guichetier enters; ecart is derived.
// One closure per guichetier per day (ClotureCaisse's @@unique) — refuses
// with ALREADY_CLOSED on a second attempt for the same day.
//
// GET /api/guichet/cloture?date=YYYY-MM-DD — that day's closures for the
// caller's org (defaults to today). A MEMBER only ever sees their own;
// ADMIN/OWNER see every guichetier's closures (§ 5.3 "historique des
// clôtures de caisse et écarts").
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { checkEcartCaisse } from '@/lib/server/guichet/alertes';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CloseBody = z.object({
  dateService: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  recetteRemise: z.number().int().nonnegative(),
});

// Normalizes to midnight local time — ClotureCaisse.dateService is always
// stored this way so the @@unique([organizationId, guichetierId,
// dateService]) constraint enforces one closure per calendar day.
function dayKey(raw: string | null | undefined): Date {
  if (raw) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const parsed = CloseBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Le montant compté (recetteRemise) est requis.',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const organizationId = auth.orgMember.organizationId;
    const guichetierId = auth.user.sub;
    const dateService = dayKey(parsed.data.dateService);
    const rangeEnd = new Date(dateService);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const existing = await prisma.clotureCaisse.findUnique({
      where: {
        organizationId_guichetierId_dateService: { organizationId, guichetierId, dateService },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'ALREADY_CLOSED', message: 'La caisse de ce jour est déjà clôturée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const emisesAgg = await prisma.guichetTransaction.aggregate({
      where: {
        organizationId,
        guichetierId,
        statut: 'emise',
        createdAt: { gte: dateService, lt: rangeEnd },
      },
      _sum: { montant: true },
    });
    const recetteTheorique = emisesAgg._sum.montant ?? 0;
    const recetteRemise = parsed.data.recetteRemise;
    const ecart = recetteRemise - recetteTheorique;

    const cloture = await prisma.clotureCaisse.create({
      data: { organizationId, guichetierId, dateService, recetteTheorique, recetteRemise, ecart },
    });

    // § 6.1 — évalué immédiatement, l'écart étant déjà connu à la clôture.
    await checkEcartCaisse(prisma, {
      organizationId,
      clotureId: cloture.id,
      guichetierName: auth.user.email,
      dateService: cloture.dateService.toISOString().slice(0, 10),
      ecart,
    });

    return NextResponse.json(
      {
        id: cloture.id,
        dateService: cloture.dateService.toISOString().slice(0, 10),
        recetteTheorique: cloture.recetteTheorique,
        recetteRemise: cloture.recetteRemise,
        ecart: cloture.ecart,
        createdAt: cloture.createdAt.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
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

    const dateService = dayKey(req.nextUrl.searchParams.get('date'));
    const isStaff = ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN;

    const rows = await prisma.clotureCaisse.findMany({
      where: {
        organizationId: auth.orgMember.organizationId,
        dateService,
        ...(isStaff ? { guichetierId: auth.user.sub } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: { guichetier: { select: { name: true, email: true } } },
    });

    return NextResponse.json(
      {
        clotures: rows.map((c) => ({
          id: c.id,
          guichetierId: c.guichetierId,
          guichetierName: c.guichetier.name ?? c.guichetier.email,
          dateService: c.dateService.toISOString().slice(0, 10),
          recetteTheorique: c.recetteTheorique,
          recetteRemise: c.recetteRemise,
          ecart: c.ecart,
          createdAt: c.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
