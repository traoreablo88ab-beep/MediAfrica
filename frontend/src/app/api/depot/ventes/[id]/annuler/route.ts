// POST /api/depot/ventes/[id]/annuler — the ONLY state transition exposed
// on a DepotVente once emitted (immutable otherwise, same principle as
// GuichetTransaction — see .planning/prd-depot-medicaments.md § 2, 4.2).
// Motif is mandatory. Restores each line's quantite to the corresponding
// product's stock via applyStockMovement (type annulation_vente), in the
// same transaction as the status change. A MEMBER (gérant) may only cancel
// their own sale; ADMIN/OWNER may cancel any sale in their org.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { applyStockMovement } from '@/lib/server/depot/stock';
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
    const organizationId = auth.orgMember.organizationId;
    const existing = await prisma.depotVente.findFirst({
      where: { id, organizationId },
      include: { lignes: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Vente introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const isStaff = ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN;
    if (isStaff && existing.gerantId !== auth.user.sub) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message: 'Vous ne pouvez annuler que vos propres ventes.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (existing.statut === 'annulee') {
      return NextResponse.json(
        { error: 'ALREADY_CANCELLED', message: 'Cette vente est déjà annulée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      for (const ligne of existing.lignes) {
        await applyStockMovement(tx, {
          organizationId,
          produitId: ligne.produitId,
          type: 'annulation_vente',
          quantite: ligne.quantite,
          auteurId: auth.user.sub,
          venteId: id,
        });
      }
      return tx.depotVente.update({
        where: { id },
        data: {
          statut: 'annulee',
          annulationMotif: parsed.data.motif,
          annulationParId: auth.user.sub,
          annulationAt: new Date(),
        },
      });
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
