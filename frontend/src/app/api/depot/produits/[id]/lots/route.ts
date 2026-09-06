// GET /api/depot/produits/[id]/lots — lots en stock for a product, in FEFO
// order (soonest-to-expire first, undated lots last), with a server-computed
// `statut` so the UI never duplicates the 30-day threshold that
// depot/peremption.ts's cron uses. Readable by any org member, same access
// level as the mouvements GET.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { SEUIL_PEREMPTION } from '@/lib/server/depot/peremption';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DAY_MS = 24 * 60 * 60 * 1000;

type LotStatut = 'expire' | 'proche_peremption' | 'ok';

function statutFor(datePeremption: Date | null, now: Date): LotStatut {
  if (!datePeremption) return 'ok';
  if (datePeremption < now) return 'expire';
  const attentionCutoff = new Date(now.getTime() + SEUIL_PEREMPTION.ATTENTION_JOURS * DAY_MS);
  if (datePeremption <= attentionCutoff) return 'proche_peremption';
  return 'ok';
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

    const lots = await prisma.medicamentLot.findMany({
      where: { organizationId, produitId: id },
      orderBy: [{ datePeremption: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        numeroLot: true,
        datePeremption: true,
        quantiteInitiale: true,
        quantiteRestante: true,
      },
    });

    const now = new Date();
    return NextResponse.json(
      {
        lots: lots.map((l) => ({
          id: l.id,
          numeroLot: l.numeroLot,
          datePeremption: l.datePeremption?.toISOString().slice(0, 10) ?? null,
          quantiteInitiale: l.quantiteInitiale,
          quantiteRestante: l.quantiteRestante,
          statut: statutFor(l.datePeremption, now),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
