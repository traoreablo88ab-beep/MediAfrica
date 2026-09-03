// POST /api/guichet/transactions/[id]/annuler — the ONLY state transition
// exposed on a GuichetTransaction once emitted; there is deliberately no
// PUT/PATCH (see .planning/prd-guichet-entree.md § 2, 7 — a transaction is
// immutable, only a traced cancellation is possible). Motif is mandatory.
// A MEMBER (guichetier) may only cancel their own transaction (§ 5.1); ADMIN
// /OWNER may cancel any transaction in their org (§ 5.2/5.3).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { checkAnnulationsRafale } from '@/lib/server/guichet/alertes';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const AnnulerBody = z.object({
  motif: z.string().trim().min(3).max(500),
});

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const parsed = AnnulerBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: "Un motif d'annulation est obligatoire (3 caractères minimum).",
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await routeCtx.params;
    const existing = await prisma.guichetTransaction.findFirst({
      where: { id, organizationId: auth.orgMember.organizationId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Transaction introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const isStaff = ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN;
    if (isStaff && existing.guichetierId !== auth.user.sub) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message: 'Vous ne pouvez annuler que vos propres transactions.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (existing.statut === 'annulee') {
      return NextResponse.json(
        { error: 'ALREADY_CANCELLED', message: 'Cette transaction est déjà annulée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const cancelled = await prisma.guichetTransaction.update({
      where: { id },
      data: {
        statut: 'annulee',
        annulationMotif: parsed.data.motif,
        annulationParId: auth.user.sub,
        annulationAt: new Date(),
      },
    });

    // § 6.3 (rafale) — évalué immédiatement après chaque annulation.
    await checkAnnulationsRafale(prisma, {
      organizationId: auth.orgMember.organizationId,
      transactionId: cancelled.id,
    });

    return NextResponse.json(
      {
        id: cancelled.id,
        statut: cancelled.statut,
        annulationMotif: cancelled.annulationMotif,
        annulationParId: cancelled.annulationParId,
        annulationAt: cancelled.annulationAt?.toISOString() ?? null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
