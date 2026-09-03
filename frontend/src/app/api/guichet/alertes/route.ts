// GET /api/guichet/alertes — paginated, filterable read of GuichetAlerte
// rows for the caller's org (.planning/prd-guichet-entree.md § 5.3 "Centre
// de notifications"). OWNER-only — this is the Promoteur's dashboard
// section; ADMIN/MEMBER don't see it (they get the fired email/notification
// for critique/attention severities but not this audit list).
//
// Filters:
//   ?severite    — info | attention | critique (exact match)
//   ?typeAlerte  — ecart_caisse | hors_horaires | annulations_suspectes |
//                  inactivite | rupture_sequence | montant_hors_grille
//   ?statut      — non_vue | vue | resolue (non_vue = vue:false;
//                  vue = vue:true, resolue:false; resolue = resolue:true)
//   ?cursor      — opaque base64 cursor from a prior page's nextCursor
//   ?limit       — 1..50 (default 20)
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STATUTS = ['non_vue', 'vue', 'resolue'] as const;
const SEVERITES = ['info', 'attention', 'critique'] as const;
const TYPES = [
  'ecart_caisse',
  'hors_horaires',
  'annulations_suspectes',
  'inactivite',
  'rupture_sequence',
  'montant_hors_grille',
] as const;

function statutWhere(raw: string | null): Prisma.GuichetAlerteWhereInput {
  if (!raw || !(STATUTS as readonly string[]).includes(raw)) return {};
  if (raw === 'non_vue') return { vue: false };
  if (raw === 'vue') return { vue: true, resolue: false };
  return { resolue: true };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.OWNER) {
      return NextResponse.json(
        {
          error: 'ORG_ROLE_INSUFFICIENT',
          message: 'Seul le promoteur (OWNER) a accès au centre de notifications.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const severiteRaw = url.searchParams.get('severite');
    const typeAlerteRaw = url.searchParams.get('typeAlerte');
    const severite =
      severiteRaw && (SEVERITES as readonly string[]).includes(severiteRaw) ? severiteRaw : null;
    const typeAlerte =
      typeAlerteRaw && (TYPES as readonly string[]).includes(typeAlerteRaw) ? typeAlerteRaw : null;

    const where: Prisma.GuichetAlerteWhereInput = {
      organizationId: auth.orgMember.organizationId,
      ...(severite ? { severite } : {}),
      ...(typeAlerte ? { typeAlerte } : {}),
      ...statutWhere(url.searchParams.get('statut')),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.guichetAlerte.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        typeAlerte: true,
        severite: true,
        details: true,
        vue: true,
        resolue: true,
        resolutionNote: true,
        createdAt: true,
      },
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        items: page.items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
        nextCursor: page.nextCursor,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
