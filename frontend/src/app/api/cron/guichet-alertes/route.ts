// Daily cron — Guichet alert sweep (§ 6.3 daily-rate + 3-consecutive-days,
// § 6.4 inactivité, § 6.5/6.6 tamper-detection sweeps). The other 3 rules
// (§ 6.1 écart, § 6.2 horaires, § 6.3 rafale) are checked synchronously
// inline in their respective routes — see lib/server/guichet/alertes.ts.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { runGuichetAlertesCheck } from '@/lib/server/guichet/alertes';
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

    await withLease(redis ?? undefined, 'guichet-alertes', LEASE_TTL_MS, async () => {
      result = await runGuichetAlertesCheck({ prisma });
      log.info('guichet-alertes tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
