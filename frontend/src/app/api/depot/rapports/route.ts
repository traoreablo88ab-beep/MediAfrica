// GET /api/depot/rapports?from=YYYY-MM-DD&to=YYYY-MM-DD — sales report for
// the caller's org, per .planning/prd-depot-medicaments.md § 5.2 ("Rapports
// du centre : ventes par produit, par période, par gérant"). Requires
// ADMIN+. Defaults to the current calendar month when no range is given.
// Only "emise" ventes count — a cancelled sale never contributes revenue,
// same convention as the clôture aggregate.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Defaults to the 1st of the current calendar month — a sensible "this
// month so far" starting point for an ADMIN opening the report cold.
function defaultRangeStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message: 'Seul un responsable de centre (ADMIN) peut consulter les rapports.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const organizationId = auth.orgMember.organizationId;
    const url = req.nextUrl;
    const rangeStart = parseDateParam(url.searchParams.get('from')) ?? defaultRangeStart();
    const rangeEndInclusive = parseDateParam(url.searchParams.get('to')) ?? new Date();
    const rangeEnd = new Date(rangeEndInclusive);
    rangeEnd.setHours(0, 0, 0, 0);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const ventes = await prisma.depotVente.findMany({
      where: {
        organizationId,
        statut: 'emise',
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        id: true,
        montantTotal: true,
        gerantId: true,
        gerant: { select: { name: true, email: true } },
        lignes: {
          select: {
            produitId: true,
            quantite: true,
            sousTotal: true,
            produit: { select: { nom: true } },
          },
        },
      },
    });

    const totalVentes = ventes.length;
    const totalMontant = ventes.reduce((sum, v) => sum + v.montantTotal, 0);

    const parProduit = new Map<
      string,
      { produitId: string; produitNom: string; quantite: number; montant: number }
    >();
    const parGerant = new Map<
      string,
      { gerantId: string; gerantName: string; montant: number; nombreVentes: number }
    >();

    for (const v of ventes) {
      const gerantEntry = parGerant.get(v.gerantId) ?? {
        gerantId: v.gerantId,
        gerantName: v.gerant.name ?? v.gerant.email,
        montant: 0,
        nombreVentes: 0,
      };
      gerantEntry.montant += v.montantTotal;
      gerantEntry.nombreVentes += 1;
      parGerant.set(v.gerantId, gerantEntry);

      for (const l of v.lignes) {
        const produitEntry = parProduit.get(l.produitId) ?? {
          produitId: l.produitId,
          produitNom: l.produit.nom,
          quantite: 0,
          montant: 0,
        };
        produitEntry.quantite += l.quantite;
        produitEntry.montant += l.sousTotal;
        parProduit.set(l.produitId, produitEntry);
      }
    }

    return NextResponse.json(
      {
        from: rangeStart.toISOString().slice(0, 10),
        to: rangeEndInclusive.toISOString().slice(0, 10),
        totalVentes,
        totalMontant,
        parProduit: [...parProduit.values()].sort((a, b) => b.montant - a.montant),
        parGerant: [...parGerant.values()].sort((a, b) => b.montant - a.montant),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
