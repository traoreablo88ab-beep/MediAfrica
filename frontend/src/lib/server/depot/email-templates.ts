// Dépôt critical-alert email — sent when a DepotAlerte is created with
// severite 'critique' (.planning/prd-depot-medicaments.md § 6.4). Same
// plain-HTML convention as lib/server/guichet/email-templates.ts.
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

export function depotAlerteCritiqueEmail(args: { title: string; body: string }): EmailTemplate {
  const title = htmlEscape(args.title);
  const body = htmlEscape(args.body);
  return {
    subject: `⚠ Alerte critique Dépôt — ${args.title}`,
    html: `<p><strong>${title}</strong></p><p>${body}</p><p>Consultez le centre de notifications de votre tableau de bord Dépôt pour plus de détails.</p>`,
  };
}
