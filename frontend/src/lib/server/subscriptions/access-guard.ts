// requireActiveSubscription — the "blocage complet" enforcement point for
// core clinical routes (Patients/Consultations/Registres). A clinic whose
// Subscription has fallen to PAST_DUE or CANCELED (unpaid trial/period, see
// lib/server/subscriptions/billing.ts) loses read AND write access to those
// routes until an OWNER/ADMIN pays from /facturation — deliberately the
// strictest of the options considered, since a softer "read-only" tier was
// also on the table and rejected in favor of a hard lock.
//
// Deliberately NOT applied to: /api/billing/*, /api/reports (comments must
// stay reachable — including to complain about being locked out), /api/auth/*,
// /api/organizations/current/members|consultants, /api/settings/clinic.
import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';

const BLOCKED_STATUSES = new Set(['PAST_DUE', 'CANCELED']);

export async function requireActiveSubscription(
  organizationId: string,
): Promise<NextResponse | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { status: true },
  });

  if (subscription && BLOCKED_STATUSES.has(subscription.status)) {
    return NextResponse.json(
      {
        error: 'SUBSCRIPTION_INACTIVE',
        message:
          "L'abonnement de ce centre est en retard de paiement — l'accès aux patients, consultations et registres est suspendu. Rendez-vous sur la page Facturation pour le réactiver.",
      },
      { status: 402 },
    );
  }

  return null;
}
