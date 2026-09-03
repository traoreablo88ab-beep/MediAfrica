// PATCH /api/guichet/alertes/[id] — mark an alert as vue/résolue and/or
// attach a resolution note (.planning/prd-guichet-entree.md § 5.3 "Action :
// marquer comme vue / résolue, ajouter une note"). OWNER-only, same gate as
// the list route. Marking resolue=true implicitly sets vue=true too (an
// alert can't be resolved without having been seen) unless the caller
// already specified vue explicitly.
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

const Body = z
  .object({
    vue: z.boolean().optional(),
    resolue: z.boolean().optional(),
    resolutionNote: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.vue !== undefined || b.resolue !== undefined || b.resolutionNote !== undefined, {
    message: 'At least one of vue, resolue, resolutionNote is required',
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

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Requête invalide.', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await routeCtx.params;
    const existing = await prisma.guichetAlerte.findFirst({
      where: { id, organizationId: auth.orgMember.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Alerte introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const d = parsed.data;
    const updated = await prisma.guichetAlerte.update({
      where: { id },
      data: {
        ...(d.vue !== undefined ? { vue: d.vue } : d.resolue === true ? { vue: true } : {}),
        ...(d.resolue !== undefined ? { resolue: d.resolue } : {}),
        ...(d.resolutionNote !== undefined ? { resolutionNote: d.resolutionNote } : {}),
      },
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

    return NextResponse.json(
      { ...updated, createdAt: updated.createdAt.toISOString() },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
