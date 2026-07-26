// Subscription billing email — separate from lib/server/auth/email-templates.ts
// since this is clinic-billing domain, not auth. Same plain-HTML convention
// (D-16 in the auth templates: no MJML/React Email).
import 'server-only';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SubscriptionRenewalDueEmailArgs {
  clinicName: string;
  billingUrl: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function subscriptionRenewalDueEmail(args: SubscriptionRenewalDueEmailArgs): EmailTemplate {
  const clinicName = htmlEscape(args.clinicName);
  const billingUrl = htmlEscape(args.billingUrl);
  return {
    subject: `Renouvellement de l’abonnement MediAfrica — ${args.clinicName}`,
    html: `<p>Bonjour,</p><p>L’abonnement MediAfrica de <strong>${clinicName}</strong> arrive à échéance. Merci de renouveler le paiement pour continuer à utiliser l’application sans interruption.</p><p><a href="${billingUrl}">Payer maintenant</a></p>`,
    text: `L'abonnement MediAfrica de ${args.clinicName} arrive à échéance. Renouvelez le paiement ici : ${args.billingUrl}`,
  };
}

export type SubscriptionReminderStage = 'j7' | 'j5' | 'j3' | 'overdue1';

export interface SubscriptionReminderEmailArgs {
  clinicName: string;
  billingUrl: string;
  stage: SubscriptionReminderStage;
}

const REMINDER_COPY: Record<SubscriptionReminderStage, { subject: string; lead: string }> = {
  j7: {
    subject: 'Votre abonnement MediAfrica se termine dans 7 jours',
    lead: 'se termine dans <strong>7 jours</strong>',
  },
  j5: {
    subject: 'Votre abonnement MediAfrica se termine dans 5 jours',
    lead: 'se termine dans <strong>5 jours</strong>',
  },
  j3: {
    subject: 'Votre abonnement MediAfrica se termine dans 3 jours',
    lead: 'se termine dans <strong>3 jours</strong>',
  },
  overdue1: {
    subject: 'Abonnement MediAfrica expiré — accès suspendu',
    lead: "est arrivé à échéance hier et l'accès à l'application est à présent suspendu",
  },
};

export function subscriptionReminderEmail(args: SubscriptionReminderEmailArgs): EmailTemplate {
  const clinicName = htmlEscape(args.clinicName);
  const billingUrl = htmlEscape(args.billingUrl);
  const { subject, lead } = REMINDER_COPY[args.stage];
  return {
    subject: `${subject} — ${args.clinicName}`,
    html: `<p>Bonjour,</p><p>L’abonnement MediAfrica de <strong>${clinicName}</strong> ${lead}. Réglez le paiement pour ${args.stage === 'overdue1' ? 'rétablir' : 'ne pas interrompre'} l’accès de votre centre.</p><p><a href="${billingUrl}">Payer maintenant</a></p>`,
    text: `L'abonnement MediAfrica de ${args.clinicName} ${lead.replace(/<\/?strong>/g, '')}. Payez ici : ${args.billingUrl}`,
  };
}
