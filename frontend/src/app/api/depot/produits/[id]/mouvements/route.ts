// POST /api/depot/produits/[id]/mouvements — record a manual stock movement
// (entrée/sortie) for a product — the "fiche de stock" from
// .planning/prd-depot-medicaments.md § 5.2. Requires ADMIN+. Goes through
// applyStockMovement(), the single point of entry for any stockActuel
// change — never a raw update of the field.
//
// GET /api/depot/produits/[id]/mouvements — chronological movement history
// for a product (entrées/sorties/ventes/annulations alike), cursor-paginated.
// Readable by any org member.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { applyStockMovement, StockInsuffisantError } from '@/lib/server/depot/stock';
import { checkRuptureStock } from '@/lib/server/depot/alertes';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MovementBody = z.object({
  type: z.enum(['entree', 'sortie']),
  quantite: z.number().int().positive(),
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

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message: 'Seul un responsable de centre (ADMIN) peut enregistrer un mouvement de stock.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const parsed = MovementBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Le type, la quantité et un motif (3 caractères minimum) sont requis.',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await routeCtx.params;
    const organizationId = auth.orgMember.organizationId;
    const existing = await prisma.medicamentProduit.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Produit introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const produit = await prisma.$transaction(async (tx) => {
        await applyStockMovement(tx, {
          organizationId,
          produitId: id,
          type: parsed.data.type,
          quantite: parsed.data.quantite,
          motif: parsed.data.motif,
          auteurId: auth.user.sub,
        });
        return tx.medicamentProduit.findUniqueOrThrow({ where: { id } });
      });

      // § 6.1 — une sortie manuelle peut aussi provoquer une rupture/un
      // seuil ; une entrée ne peut jamais en déclencher une (elle augmente
      // le stock), donc inutile de vérifier dans ce cas.
      if (parsed.data.type === 'sortie') {
        await checkRuptureStock(prisma, {
          organizationId,
          produitId: produit.id,
          produitNom: produit.nom,
          stockApres: produit.stockActuel,
          seuilAlerteStock: produit.seuilAlerteStock,
        });
      }

      return NextResponse.json(
        {
          id: produit.id,
          nom: produit.nom,
          stockActuel: produit.stockActuel,
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof StockInsuffisantError) {
        return NextResponse.json(
          { error: 'STOCK_INSUFFISANT', message: err.message },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const { id } = await routeCtx.params;
    const organizationId = auth.orgMember.organizationId;
    const existing = await prisma.medicamentProduit.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Produit introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.depotMouvementStock.findMany({
      where: { organizationId, produitId: id, ...cursorWhere(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        quantite: true,
        motif: true,
        venteId: true,
        stockAvant: true,
        stockApres: true,
        auteur: { select: { name: true, email: true } },
        createdAt: true,
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        items: page.items.map((m) => ({
          id: m.id,
          type: m.type,
          quantite: m.quantite,
          motif: m.motif,
          venteId: m.venteId,
          stockAvant: m.stockAvant,
          stockApres: m.stockApres,
          auteurName: m.auteur.name ?? m.auteur.email,
          createdAt: m.createdAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
