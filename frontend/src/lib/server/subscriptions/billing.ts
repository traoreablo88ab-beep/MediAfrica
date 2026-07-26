// Subscription-billing cron logic — called by
// app/api/cron/subscription-billing/route.ts. Does NOT call the payment
// provider directly (no outbound Bictorys call from an unattended cron);
// it only flags due subscriptions PAST_DUE and emails the clinic owner a
// link to /facturation, where they trigger the actual charge via
// POST /api/billing/pay. Subscriptions unpaid for CANCEL_GRACE_DAYS past
// their period end are marked CANCELED.
//
// Reminder sequence — a separate nudge ladder ahead of / just after
// `currentPeriodEnd`: J-7, J-5, J-3, and one day after expiry (once the
// clinic is already locked out — see requireActiveSubscription). Each stage
// stamps its own `reminderXSentAt` column so a subscription only ever gets
// one email per stage per billing period; those columns are cleared on
// renewal (see the Bictorys webhook's onPaid handler).
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { enqueueOutbox } from '../outbox';

const CANCEL_GRACE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RunSubscriptionBillingResult {
  markedPastDue: number;
  canceled: number;
  remindersSent: number;
}

type ReminderField =
  | 'reminder7dSentAt'
  | 'reminder5dSentAt'
  | 'reminder3dSentAt'
  | 'reminderOverdueSentAt';

function reminderWhereFragment(field: ReminderField): Prisma.SubscriptionWhereInput {
  switch (field) {
    case 'reminder7dSentAt':
      return { reminder7dSentAt: null };
    case 'reminder5dSentAt':
      return { reminder5dSentAt: null };
    case 'reminder3dSentAt':
      return { reminder3dSentAt: null };
    case 'reminderOverdueSentAt':
      return { reminderOverdueSentAt: null };
  }
}

function reminderDataFragment(field: ReminderField, now: Date): Prisma.SubscriptionUpdateInput {
  switch (field) {
    case 'reminder7dSentAt':
      return { reminder7dSentAt: now };
    case 'reminder5dSentAt':
      return { reminder5dSentAt: now };
    case 'reminder3dSentAt':
      return { reminder3dSentAt: now };
    case 'reminderOverdueSentAt':
      return { reminderOverdueSentAt: now };
  }
}

function windowBounds(now: Date, daysFromNow: number): { gte: Date; lt: Date } {
  // "Exactly N days from now" as a 24h window so a once-daily cron tick
  // reliably catches it regardless of the exact hour it runs at.
  const lt = new Date(now.getTime() + daysFromNow * DAY_MS);
  const gte = new Date(lt.getTime() - DAY_MS);
  return { gte, lt };
}

export async function runSubscriptionBilling(deps: {
  prisma: PrismaClient;
  now?: Date;
}): Promise<RunSubscriptionBillingResult> {
  const { prisma } = deps;
  const now = deps.now ?? new Date();
  const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

  let remindersSent = 0;

  const stages: Array<{
    stage: 'j7' | 'j5' | 'j3' | 'overdue1';
    daysFromNow: number;
    statuses: string[];
    field: ReminderField;
  }> = [
    { stage: 'j7', daysFromNow: 7, statuses: ['TRIALING', 'ACTIVE'], field: 'reminder7dSentAt' },
    { stage: 'j5', daysFromNow: 5, statuses: ['TRIALING', 'ACTIVE'], field: 'reminder5dSentAt' },
    { stage: 'j3', daysFromNow: 3, statuses: ['TRIALING', 'ACTIVE'], field: 'reminder3dSentAt' },
    // "1 day after the end" — by now the day-0 sweep below has already
    // flipped the subscription to PAST_DUE, so this only ever matches
    // subscriptions that are actually overdue.
    { stage: 'overdue1', daysFromNow: -1, statuses: ['PAST_DUE'], field: 'reminderOverdueSentAt' },
  ];

  for (const { stage, daysFromNow, statuses, field } of stages) {
    const { gte, lt } = windowBounds(now, daysFromNow);
    const candidates = await prisma.subscription.findMany({
      where: {
        status: { in: statuses },
        currentPeriodEnd: { gte, lt },
        ...reminderWhereFragment(field),
      },
      include: { organization: { include: { owner: true } } },
    });

    for (const sub of candidates) {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: reminderDataFragment(field, now),
        });
        await enqueueOutbox(tx, {
          kind: 'email.subscription_reminder',
          payload: {
            to: sub.organization.owner.email,
            clinicName: sub.organization.name,
            billingUrl: `${publicUrl}/facturation`,
            stage,
          },
        });
      });
      remindersSent += 1;
    }
  }

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

  return { markedPastDue, canceled: canceled.count, remindersSent };
}
