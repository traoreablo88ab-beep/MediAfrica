// POST /api/depot/cloture — a gérant de dépôt closes their own shift for a
// given day (defaults to today). recetteTheorique is always server-computed
// (Σ montantTotal of that gérant's "emise" ventes for the day, per
// .planning/prd-depot-medicaments.md § 4.6/5.1) — never accepted from the
// client, same anti-fraud principle as sale emission. recetteRemise is the
// physically-counted amount the gérant enters; ecart is derived. One closure
// per gérant per day (DepotCloture's @@unique) — refuses with ALREADY_CLOSED
// on a second attempt for the same day. Separate till from Guichet's.
//
// GET /api/depot/cloture?date=YYYY-MM-DD — that day's closures for the
// caller's org (defaults to today). A MEMBER only ever sees their own;
// ADMIN/OWNER see every gérant's closures (§ 5.3 "historique des clôtures de
// caisse dépôt et écarts").
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { checkEcartCaisse } from '@/lib/server/depot/alertes';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CloseBody = z.object({
  dateService: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  recetteRemise: z.number().int().nonnegative(),
});

// Normalizes to midnight local time — DepotCloture.dateService is always
// stored this way so the @@unique([organizationId, gerantId, dateService])
// constraint enforces one closure per calendar day.
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
    const gerantId = auth.user.sub;
    const dateService = dayKey(parsed.data.dateService);
    const rangeEnd = new Date(dateService);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const existing = await prisma.depotCloture.findUnique({
      where: {
        organizationId_gerantId_dateService: { organizationId, gerantId, dateService },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'ALREADY_CLOSED', message: 'La caisse de ce jour est déjà clôturée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const emisesAgg = await prisma.depotVente.aggregate({
      where: {
        organizationId,
        gerantId,
        statut: 'emise',
        createdAt: { gte: dateService, lt: rangeEnd },
      },
      _sum: { montantTotal: true },
    });
    const recetteTheorique = emisesAgg._sum.montantTotal ?? 0;
    const recetteRemise = parsed.data.recetteRemise;
    const ecart = recetteRemise - recetteTheorique;

    const cloture = await prisma.depotCloture.create({
      data: { organizationId, gerantId, dateService, recetteTheorique, recetteRemise, ecart },
    });

    // § 6.2 — évalué immédiatement, l'écart étant déjà connu à la clôture.
    await checkEcartCaisse(prisma, {
      organizationId,
      clotureId: cloture.id,
      gerantName: auth.user.email,
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

    const rows = await prisma.depotCloture.findMany({
      where: {
        organizationId: auth.orgMember.organizationId,
        dateService,
        ...(isStaff ? { gerantId: auth.user.sub } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: { gerant: { select: { name: true, email: true } } },
    });

    return NextResponse.json(
      {
        clotures: rows.map((c) => ({
          id: c.id,
          gerantId: c.gerantId,
          gerantName: c.gerant.name ?? c.gerant.email,
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
