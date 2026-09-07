export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { reconcileSubscriptions } from '@/lib/server/subscriptions/reconcile';
import {
  getChariowClient,
  ChariowUnconfiguredError,
} from '@/lib/server/subscriptions/chariow-singleton';
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
    let processed = 0;

    await withLease(redis ?? undefined, 'subscription-reconcile', LEASE_TTL_MS, async () => {
      let chariow;
      try {
        chariow = getChariowClient();
      } catch (err) {
        if (err instanceof ChariowUnconfiguredError) {
          log.warn('subscription-reconcile tick skipped — Chariow not configured');
          return;
        }
        throw err;
      }

      const result = await reconcileSubscriptions({ prisma, chariow });
      processed = result.reconciled;
      log.info('subscription-reconcile tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
