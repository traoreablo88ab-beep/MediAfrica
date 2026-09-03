// PATCH /api/guichet/types-recette/[id] — partial update of a tariff row
// (libelle/tarif/actif). Requires ADMIN+. Never deletable (no DELETE) —
// GuichetTransaction.typeRecetteId is onDelete: Restrict and history must
// survive a tariff being retired; deactivate via actif=false instead.
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
    libelle: z.string().trim().min(1).max(200).optional(),
    tarif: z.number().int().nonnegative().optional(),
    actif: z.boolean().optional(),
  })
  .refine((b) => b.libelle !== undefined || b.tarif !== undefined || b.actif !== undefined, {
    message: 'Au moins un champ doit être fourni.',
  });

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
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
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
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await routeCtx.params;
    const existing = await prisma.typeRecette.findFirst({
      where: { id, organizationId: auth.orgMember.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Tarif introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { libelle, tarif, actif } = parsed.data;
    const type = await prisma.typeRecette.update({
      where: { id },
      data: {
        ...(libelle !== undefined ? { libelle } : {}),
        ...(tarif !== undefined ? { tarif } : {}),
        ...(actif !== undefined ? { actif } : {}),
      },
    });

    return NextResponse.json(
      { id: type.id, libelle: type.libelle, tarif: type.tarif, actif: type.actif },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
