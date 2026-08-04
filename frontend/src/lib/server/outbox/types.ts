/**
 * Outbox event types. Add new variants here, then handle them in
 * backend/src/lib/outbox/dispatcher.ts.
 *
 * `kind` is a dotted "domain.event" string. The dispatcher looks up the
 * handler by exact match — no inheritance, no fallback dispatching.
 *
 * Each variant carries its own `payload` shape; runtime validation
 * happens in the dispatcher (the JSON column is opaque to Prisma).
 */

export type OutboxEvent =
  | NotificationPaymentReceivedEvent
  | EmailPaymentConfirmationEvent
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | EmailSubscriptionRenewalDueEvent
  | EmailSubscriptionReminderEvent
  | EmailAdminPromotedEvent;

export interface NotificationPaymentReceivedEvent {
  kind: 'notification.payment_received';
  payload: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

export interface EmailPaymentConfirmationEvent {
  kind: 'email.payment_confirmation';
  payload: {
    to: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Phase 1 — emitted by signup + resend-verification routes; consumed by the
 * email-queue cron in Phase 5 (which calls verificationEmail() to render).
 */
export interface EmailVerificationCodeEvent {
  kind: 'email.verification_code';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Phase 1 — emitted by forgot-password route; consumed by the email-queue cron
 * in Phase 5 (which calls resetPasswordEmail() to render).
 */
export interface EmailPasswordResetEvent {
  kind: 'email.password_reset';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Emitted by the subscription-billing cron when a clinic's subscription
 * period ends and payment is due. Consumed by the email-queue cron (calls
 * subscriptionRenewalDueEmail() to render).
 */
export interface EmailSubscriptionRenewalDueEvent {
  kind: 'email.subscription_renewal_due';
  payload: {
    to: string;
    clinicName: string;
    billingUrl: string;
  };
}

/**
 * Emitted by the subscription-billing cron ahead of / just after
 * `currentPeriodEnd` — a 4-stage nudge sequence (J-7, J-5, J-3, and one day
 * after the period ends) distinct from `email.subscription_renewal_due`
 * (fired once, exactly at the day-0 transition to PAST_DUE).
 */
export interface EmailSubscriptionReminderEvent {
  kind: 'email.subscription_reminder';
  payload: {
    to: string;
    clinicName: string;
    billingUrl: string;
    stage: 'j7' | 'j5' | 'j3' | 'overdue1';
  };
}

/**
 * Emitted by PATCH /api/admin/users/[id]/role when a USER is promoted to
 * ADMIN or SUPERADMIN. Consumed by the email-queue cron (calls
 * adminPromotedEmail() to render).
 */
export interface EmailAdminPromotedEvent {
  kind: 'email.admin_promoted';
  payload: {
    to: string;
    role: 'ADMIN' | 'SUPERADMIN';
  };
}

export type OutboxEventKind = OutboxEvent['kind'];
