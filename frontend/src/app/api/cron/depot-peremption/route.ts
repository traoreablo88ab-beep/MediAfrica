// Daily cron — Dépôt lot-expiration sweep (FEFO addendum to
// .planning/prd-depot-medicaments.md). The 2 base Dépôt alert rules (§ 6.1
// rupture_stock, § 6.2 ecart_caisse) are checked synchronously inline in
// their respective routes — see lib/server/depot/alertes.ts. Expiration is
// passive in time, so it needs its own daily tick instead.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { runDepotPeremptionCheck } from '@/lib/server/depot/peremption';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result = { organizationsChecked: 0, alertsFired: 0 };

    await withLease(redis ?? undefined, 'depot-peremption', LEASE_TTL_MS, async () => {
      result = await runDepotPeremptionCheck({ prisma });
      log.info('depot-peremption tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
