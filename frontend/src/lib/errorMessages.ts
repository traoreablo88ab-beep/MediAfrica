// Shared client-side error formatter — turns an ApiError into a message a
// non-technical user can act on. ApiError.message is set from body.error
// (a stable code like "VALIDATION_FAILED"), never shown directly here.
import { ApiError } from '@/lib/api';

const FIELD_LABELS: Record<string, string> = {
  telephonePrincipal: 'Téléphone principal',
  telephoneSecondaire: 'Téléphone secondaire',
  contactUrgenceTelephone: 'Téléphone du contact d’urgence',
  nom: 'Nom',
  prenom: 'Prénom',
  dateNaissance: 'Date de naissance',
  sexe: 'Sexe',
  communeResidence: 'Commune de résidence',
  motif: 'Motif',
  email: 'Email',
  newPassword: 'Nouveau mot de passe',
  code: 'Code de vérification',
};

// A handful of stable error codes come back with an English message
// hardcoded server-side (middleware/index.ts is off-limits — see
// CLAUDE.md's protected-files list — so the fix lives here instead).
// Codes not listed here fall through to the server's own message.
const CODE_MESSAGES: Record<string, string> = {
  NO_ORGANIZATION: 'Votre compte n’est pas encore rattaché à un centre de santé.',
  ORGANIZATION_NOT_FOUND: 'Centre de santé introuvable.',
  ADMIN_REQUIRED: 'Accès réservé aux administrateurs.',
  ORG_ROLE_INSUFFICIENT: 'Votre rôle ne permet pas cette action.',
};

interface ZodIssueLike {
  path?: unknown;
  message?: unknown;
}

function formatIssues(issues: unknown): string | null {
  if (!Array.isArray(issues) || issues.length === 0) return null;
  const parts = issues.slice(0, 3).map((raw) => {
    const issue = raw as ZodIssueLike;
    const path = Array.isArray(issue.path) ? issue.path.join('.') : '';
    const label = FIELD_LABELS[path];
    if (
      path === 'telephonePrincipal' ||
      path === 'telephoneSecondaire' ||
      path === 'contactUrgenceTelephone'
    ) {
      return `${label} : le numéro doit commencer par + suivi de l’indicatif pays (ex: +223 76 01 23 45).`;
    }
    if (label) return `${label} : champ invalide ou manquant.`;
    return typeof issue.message === 'string' ? issue.message : null;
  });
  const clean = parts.filter((p): p is string => !!p);
  return clean.length > 0 ? clean.join(' ') : null;
}

export function friendlyError(
  err: unknown,
  fallback = 'Une erreur est survenue. Réessayez.',
): string {
  if (!(err instanceof ApiError)) return fallback;

  if (err.code === 'VALIDATION_FAILED') {
    const fromIssues = formatIssues(err.body.issues);
    if (fromIssues) return fromIssues;
  }

  const codeMessage = err.code ? CODE_MESSAGES[err.code] : undefined;
  if (codeMessage) return codeMessage;

  const serverMessage = err.body.message;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;

  return err.status === 401 ? 'Vous devez être connecté pour effectuer cette action.' : fallback;
}
