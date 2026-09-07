// Subscription payment reconciliation — the actual source of truth for
// crediting a Chariow checkout. Central rule (see chariow-client.ts and
// webhook/chariow.ts's onPaid): never credit from the webhook body alone,
// always re-pull GET /sales/{id} first.
//
// Called from two places, neither constrained by the webhook's forced
// Serializable transaction (see api/webhooks/chariow/route.ts's comment for
// why the network call can't live inside that tx):
//   - the checkout-return poll route (fast path, user is watching)
//   - the subscription-reconcile cron (safety net — catches missed/late
//     webhooks, or a user who closed the tab before the poll finished)
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';
import type { ChariowClient } from './chariow-client';
import { mapChariowStatus } from './chariow-client';

const logger = createLogger();

function pendingExpireHours(): number {
  const raw = Number(process.env.CHARIOW_PENDING_EXPIRE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
}

function failedRecheckDays(): number {
  const raw = Number(process.env.CHARIOW_FAILED_RECHECK_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 14;
}

export interface ReconcilablePayment {
  id: string;
  providerSaleId: string;
  subscriptionId: string;
}

export interface ReconcilePaymentResult {
  outcome: 'succeeded' | 'failed' | 'abandoned' | 'pending';
}

/**
 * Pulls the real status from Chariow (network call, outside any tx) and, on
 * success, atomically flips the payment + parent subscription. WHERE-guarded
 * so a racing caller (cron vs. return-poll both firing at once) can't
 * double-process the same row.
 */
export async function reconcilePayment(
  prisma: PrismaClient,
  chariow: ChariowClient,
  payment: ReconcilablePayment,
): Promise<ReconcilePaymentResult> {
  const sale = await chariow.getSale(payment.providerSaleId);
  const mapped = mapChariowStatus(sale.status);

  if (mapped === 'succeeded') {
    // Never a bare `new Date()` here except as a last resort — a late
    // catch-up must keep the real payment date, not the date reconciliation
    // happened to run.
    const succeededAt = sale.settledAt ?? sale.paidAt ?? new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.subscriptionPayment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
        data: {
          status: 'SUCCEEDED',
          succeededAt,
          ...(sale.amount ? { amount: sale.amount.value, currency: sale.amount.currency } : {}),
        },
      });
      if (updated.count === 0) return; // already processed by a racing caller

      const subscription = await tx.subscription.findUnique({
        where: { id: payment.subscriptionId },
        include: { plan: true },
      });
      if (!subscription) return;

      // Same fixed-cycle convention as the existing Bictorys onPaid handler
      // (webhooks/bictorys/route.ts) — extend from currentPeriodEnd, not
      // from succeededAt, so a late-reconciled payment doesn't shorten the
      // clinic's paid period.
      const nextPeriodEnd = new Date(subscription.currentPeriodEnd);
      nextPeriodEnd.setDate(nextPeriodEnd.getDate() + subscription.plan.billingIntervalDays);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: nextPeriodEnd,
          trialEndsAt: null,
          reminder7dSentAt: null,
          reminder5dSentAt: null,
          reminder3dSentAt: null,
          reminderOverdueSentAt: null,
        },
      });
    });
  } else if (mapped === 'failed' || mapped === 'abandoned') {
    await prisma.subscriptionPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' }, // never overwrite a SUCCEEDED row
      data: { status: mapped === 'failed' ? 'FAILED' : 'ABANDONED' },
    });
  } else {
    await prisma.subscriptionPayment.updateMany({
      where: { id: payment.id },
      data: { lastReconciledAt: new Date() },
    });
  }

  return { outcome: mapped };
}

export interface ReconcileSubscriptionsOptions {
  prisma: PrismaClient;
  chariow: ChariowClient;
  batchSize?: number;
  now?: Date;
}

export interface ReconcileSubscriptionsResult {
  reconciled: number;
  activated: number;
  expiredPayments: number;
}

export async function reconcileSubscriptions(
  opts: ReconcileSubscriptionsOptions,
): Promise<ReconcileSubscriptionsResult> {
  const { prisma, chariow } = opts;
  const batchSize = opts.batchSize ?? 100;
  const now = opts.now ?? new Date();

  let reconciled = 0;
  let activated = 0;
  let expiredPayments = 0;

  const failedCutoff = new Date(now);
  failedCutoff.setDate(failedCutoff.getDate() - failedRecheckDays());

  // 1. Reconcile PENDING (not yet past expiresAt) + recently-FAILED payments.
  const toReconcile = await prisma.subscriptionPayment.findMany({
    where: {
      OR: [
        { status: 'PENDING', expiresAt: { gt: now } },
        { status: 'FAILED', updatedAt: { gt: failedCutoff } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: { id: true, providerSaleId: true, subscriptionId: true },
  });

  for (const payment of toReconcile) {
    try {
      const result = await reconcilePayment(prisma, chariow, payment);
      reconciled++;
      if (result.outcome === 'succeeded') activated++;
    } catch (err) {
      logger.error('[subscription-reconcile] reconcilePayment failed', {
        paymentId: payment.id,
        err: String(err),
      });
    }
  }

  // 2. Expire stale PENDING rows — one last reconcile each (catches a
  // legitimate late success) before flipping to EXPIRED.
  const stalePending = await prisma.subscriptionPayment.findMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    take: batchSize,
    select: { id: true, providerSaleId: true, subscriptionId: true },
  });

  for (const payment of stalePending) {
    try {
      const result = await reconcilePayment(prisma, chariow, payment);
      if (result.outcome === 'succeeded') {
        activated++;
        continue;
      }
    } catch (err) {
      logger.error('[subscription-reconcile] last-chance reconcile failed', {
        paymentId: payment.id,
        err: String(err),
      });
    }
    const updated = await prisma.subscriptionPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    expiredPayments += updated.count;
  }

  return { reconciled, activated, expiredPayments };
}

export { pendingExpireHours };
