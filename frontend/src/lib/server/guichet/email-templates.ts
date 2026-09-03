// Guichet critical-alert email — sent when a GuichetAlerte is created with
// severite 'critique' (.planning/prd-guichet-entree.md § 6.7). Same
// plain-HTML convention as lib/server/subscriptions/email-templates.ts.
import 'server-only';

export interface EmailTemplate {
  subject: string;
  html: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function guichetAlerteCritiqueEmail(args: { title: string; body: string }): EmailTemplate {
  const title = htmlEscape(args.title);
  const body = htmlEscape(args.body);
  return {
    subject: `⚠ Alerte critique Guichet — ${args.title}`,
    html: `<p><strong>${title}</strong></p><p>${body}</p><p>Consultez le centre de notifications de votre tableau de bord Guichet pour plus de détails.</p>`,
  };
}
