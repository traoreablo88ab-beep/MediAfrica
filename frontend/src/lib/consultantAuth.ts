// Shared between the login page, the "Admin CSRéf" page, and the backend
// consultants routes. Consultant accounts log in with a short identifiant
// instead of a real email (many CSRéf consultants don't have one) — under
// the hood they're still a normal User row with a synthetic email at this
// fixed domain, so the existing email+password login route needs no changes.
export const CONSULTANT_EMAIL_DOMAIN = 'consultant.mediafrica.local';

export const IDENTIFIANT_REGEX = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/;

export function isConsultantEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${CONSULTANT_EMAIL_DOMAIN}`);
}

export function identifiantToEmail(identifiant: string): string {
  return `${identifiant.trim().toLowerCase()}@${CONSULTANT_EMAIL_DOMAIN}`;
}

export function emailToIdentifiant(email: string): string {
  return email.slice(0, email.length - CONSULTANT_EMAIL_DOMAIN.length - 1);
}

// Login form accepts either a real email or a bare identifiant — if there's
// no "@", it's an identifiant and needs the synthetic domain appended before
// hitting /api/auth/login (which only ever sees emails).
export function loginInputToEmail(input: string): string {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed : identifiantToEmail(trimmed);
}
