// GET /api/depot/produits — the caller's org medication catalogue (all rows,
// active and inactive — the gérant point-of-vente UI filters to actif=true
// client-side; the ADMIN catalogue UI needs the full list to reactivate a
// row). Readable by any org member — selecting a product to sell requires
// reading the catalogue + current stock.
//
// POST /api/depot/produits — add a catalogue row. Requires ADMIN+ (the
// "responsable de centre" role per .planning/prd-depot-medicaments.md § 3).
// stockActuel always starts at 0 — an opening stock is declared afterward
// as an "entree" movement (POST .../mouvements), so every stock change,
// including the very first one, goes through the single audit ledger.
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

const CreateBody = z.object({
  nom: z.string().trim().min(1).max(200),
  prixUnitaire: z.number().int().nonnegative(),
  seuilAlerteStock: z.number().int().nonnegative().optional(),
  actif: z.boolean().optional(),
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

    const produits = await prisma.medicamentProduit.findMany({
      where: { organizationId: auth.orgMember.organizationId },
      orderBy: { nom: 'asc' },
    });

    return NextResponse.json(
      {
        produits: produits.map((p) => ({
          id: p.id,
          nom: p.nom,
          prixUnitaire: p.prixUnitaire,
          stockActuel: p.stockActuel,
          seuilAlerteStock: p.seuilAlerteStock,
          actif: p.actif,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
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

    const produit = await prisma.medicamentProduit.create({
      data: {
        organizationId: auth.orgMember.organizationId,
        nom: parsed.data.nom,
        prixUnitaire: parsed.data.prixUnitaire,
        stockActuel: 0,
        ...(parsed.data.seuilAlerteStock !== undefined
          ? { seuilAlerteStock: parsed.data.seuilAlerteStock }
          : {}),
        ...(parsed.data.actif !== undefined ? { actif: parsed.data.actif } : {}),
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
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
