// PATCH /api/depot/produits/[id] — partial update of a catalogue row
// (nom/prixUnitaire/seuilAlerteStock/actif). Requires ADMIN+. Never
// deletable (no DELETE) — DepotVenteLigne.produitId is onDelete: Restrict
// and history must survive a product being retired; deactivate via
// actif=false instead. stockActuel is intentionally NOT patchable here — it
// only ever changes through applyStockMovement() (see POST .../mouvements).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z
  .object({
    nom: z.string().trim().min(1).max(200).optional(),
    prixUnitaire: z.number().int().nonnegative().optional(),
    seuilAlerteStock: z.number().int().nonnegative().nullable().optional(),
    actif: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.nom !== undefined ||
      b.prixUnitaire !== undefined ||
      b.seuilAlerteStock !== undefined ||
      b.actif !== undefined,
    { message: 'Au moins un champ doit être fourni.' },
  );

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message: 'Seul un responsable de centre (ADMIN) peut gérer le catalogue.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Requête invalide.',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await routeCtx.params;
    const existing = await prisma.medicamentProduit.findFirst({
      where: { id, organizationId: auth.orgMember.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Produit introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { nom, prixUnitaire, seuilAlerteStock, actif } = parsed.data;
    const produit = await prisma.medicamentProduit.update({
      where: { id },
      data: {
        ...(nom !== undefined ? { nom } : {}),
        ...(prixUnitaire !== undefined ? { prixUnitaire } : {}),
        ...(seuilAlerteStock !== undefined ? { seuilAlerteStock } : {}),
        ...(actif !== undefined ? { actif } : {}),
      },
    });

    return NextResponse.json(
      {
        id: produit.id,
        nom: produit.nom,
        prixUnitaire: produit.prixUnitaire,
        stockActuel: produit.stockActuel,
        seuilAlerteStock: produit.seuilAlerteStock,
        actif: produit.actif,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
