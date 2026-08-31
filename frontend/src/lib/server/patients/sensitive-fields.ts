import 'server-only';
import { encrypt, decrypt } from '@/lib/server/crypto';

// Application-level encryption for the Patient columns that carry the most
// sensitive data: national health-insurance identifiers (RAMED/AMO) and
// free-text medical history. These are never filtered/searched by Prisma
// (unlike telephonePrincipal, which stays plaintext on purpose — it's
// matched with `contains`/exact-equality for search and duplicate
// detection, which ciphertext with a random IV can't support).
//
// decryptSensitive is deliberately tolerant: rows written before this
// module existed still hold plaintext in these columns, and decrypt()
// throws on anything that isn't the `iv:tag:data` shape it produced. On
// that specific failure we return the raw value as-is rather than
// crashing the read — new/edited records get encrypted going forward,
// existing ones display correctly until a separate backfill migrates them.

function requireKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is required to write patient sensitive fields. Set it in .env (32 bytes, base64 — generate with `openssl rand -base64 32`).',
    );
  }
  return key;
}

export function encryptSensitive(value: string): string {
  return encrypt(value, requireKey());
}

export function decryptSensitive(value: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return value;
  try {
    return decrypt(value, key);
  } catch {
    // Not our ciphertext shape (or wrong key) — legacy plaintext, return as-is.
    return value;
  }
}
