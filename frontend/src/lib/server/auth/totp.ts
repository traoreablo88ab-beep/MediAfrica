import 'server-only';
import crypto from 'node:crypto';
import { authenticator } from 'otplib';
import { encrypt, decrypt } from '@/lib/server/crypto';

// TOTP (RFC 6238) enrollment + verification for the ADMIN/SUPERADMIN 2FA
// opt-in (see /api/auth/2fa/*). authenticator's default step (30s) and
// window (±1 step) match every mainstream authenticator app.
//
// Unlike lib/server/patients/sensitive-fields.ts, decryptTotpSecret has NO
// tolerant plaintext fallback: a TOTP secret is only ever written through
// encryptTotpSecret from day one (brand-new feature, no legacy plaintext
// rows can exist), so a decrypt failure is a real error, not an expected
// legacy-data shape — let it throw.

function requireEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is required for TOTP secrets. Set it in .env (32 bytes, base64 — generate with `openssl rand -base64 32`).',
    );
  }
  return key;
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpauthUri(secret: string, email: string): string {
  return authenticator.keyuri(email, 'MediAfrica', secret);
}

export function verifyTotpCode(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    // otplib throws on a malformed token (non-numeric, wrong length) rather
    // than returning false — treat that the same as an invalid code.
    return false;
  }
}

export function encryptTotpSecret(value: string): string {
  return encrypt(value, requireEncryptionKey());
}

export function decryptTotpSecret(value: string): string {
  return decrypt(value, requireEncryptionKey());
}

const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BACKUP_CODE_GROUP_LENGTH = 4;
const BACKUP_CODE_GROUPS = 2;
const DEFAULT_BACKUP_CODE_COUNT = 10;

function randomBackupCode(): string {
  const bytes = crypto.randomBytes(BACKUP_CODE_GROUP_LENGTH * BACKUP_CODE_GROUPS);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && i % BACKUP_CODE_GROUP_LENGTH === 0) out += '-';
    out += BACKUP_CODE_ALPHABET[bytes[i]! % BACKUP_CODE_ALPHABET.length];
  }
  return out;
}

/** Generates `count` unique single-use recovery codes, e.g. "AB3D-7XQK". */
export function generateBackupCodes(count: number = DEFAULT_BACKUP_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(randomBackupCode());
  }
  return Array.from(codes);
}
