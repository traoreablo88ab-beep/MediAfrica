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
