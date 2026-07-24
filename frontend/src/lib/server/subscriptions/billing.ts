// Subscription-billing cron logic — called by
// app/api/cron/subscription-billing/route.ts. Does NOT call the payment
// provider directly (no outbound Bictorys call from an unattended cron);
// it only flags due subscriptions PAST_DUE and emails the clinic owner a
// link to /facturation, where they trigger the actual charge via
// POST /api/billing/pay. Subscriptions unpaid for CANCEL_GRACE_DAYS past
// their period end are marked CANCELED.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { enqueueOutbox } from '../outbox';

const CANCEL_GRACE_DAYS = 14;

export interface RunSubscriptionBillingResult {
  markedPastDue: number;
  canceled: number;
}

export async function runSubscriptionBilling(deps: {
  prisma: PrismaClient;
  now?: Date;
}): Promise<RunSubscriptionBillingResult> {
  const { prisma } = deps;
  const now = deps.now ?? new Date();
  const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

  const due = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { lte: now } },
    include: { organization: { include: { owner: true } } },
  });

  let markedPastDue = 0;
  for (const sub of due) {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
      await enqueueOutbox(tx, {
        kind: 'email.subscription_renewal_due',
        payload: {
          to: sub.organization.owner.email,
          clinicName: sub.organization.name,
          billingUrl: `${publicUrl}/facturation`,
        },
      });
    });
    markedPastDue += 1;
  }

  const cancelCutoff = new Date(now);
  cancelCutoff.setDate(cancelCutoff.getDate() - CANCEL_GRACE_DAYS);
  const canceled = await prisma.subscription.updateMany({
    where: { status: 'PAST_DUE', currentPeriodEnd: { lte: cancelCutoff } },
    data: { status: 'CANCELED' },
  });

  return { markedPastDue, canceled: canceled.count };
}
