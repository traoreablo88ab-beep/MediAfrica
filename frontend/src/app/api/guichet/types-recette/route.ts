// GET /api/guichet/types-recette — the caller's org tariff grid (all rows,
// active and inactive — the guichetier UI filters to actif=true client-side;
// the ADMIN grille-tarifaire UI needs the full list to reactivate a row).
//
// POST /api/guichet/types-recette — add a tariff row. Requires ADMIN+ (the
// "responsable de centre" role per .planning/prd-guichet-entree.md § 3/5.2)
// — a guichetier (MEMBER) can read the grid but never edit it.
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
  libelle: z.string().trim().min(1).max(200),
  tarif: z.number().int().nonnegative(),
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

    const types = await prisma.typeRecette.findMany({
      where: { organizationId: auth.orgMember.organizationId },
      orderBy: { libelle: 'asc' },
    });

    return NextResponse.json(
      {
        types: types.map((t) => ({
          id: t.id,
          libelle: t.libelle,
          tarif: t.tarif,
          actif: t.actif,
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
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
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
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const type = await prisma.typeRecette.create({
      data: {
        organizationId: auth.orgMember.organizationId,
        libelle: parsed.data.libelle,
        tarif: parsed.data.tarif,
        ...(parsed.data.actif !== undefined ? { actif: parsed.data.actif } : {}),
      },
    });

    return NextResponse.json(
      { id: type.id, libelle: type.libelle, tarif: type.tarif, actif: type.actif },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
