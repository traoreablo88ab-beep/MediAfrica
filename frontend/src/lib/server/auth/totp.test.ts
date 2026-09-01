import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
} from './totp';

describe('generateTotpSecret', () => {
  it('generates a base32 secret usable to produce a valid code', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);
    const token = authenticator.generate(secret);
    expect(verifyTotpCode(token, secret)).toBe(true);
  });
});

describe('buildOtpauthUri', () => {
  it('embeds the issuer, account name, and secret', () => {
    const secret = generateTotpSecret();
    const uri = buildOtpauthUri(secret, 'admin@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('MediAfrica');
    expect(uri).toContain(encodeURIComponent('admin@example.com'));
    expect(uri).toContain(secret);
  });
});

describe('verifyTotpCode', () => {
  it('accepts the current valid code', () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotpCode(token, secret)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    const wrongToken = authenticator.generate(generateTotpSecret());
    expect(verifyTotpCode(wrongToken, secret)).toBe(false);
  });

  it('rejects a malformed token instead of throwing', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode('not-a-code', secret)).toBe(false);
  });
});

describe('encryptTotpSecret / decryptTotpSecret', () => {
  it('round-trips a secret under the fixture ENCRYPTION_KEY', () => {
    const secret = generateTotpSecret();
    const ciphertext = encryptTotpSecret(secret);
    expect(ciphertext).not.toBe(secret);
    expect(decryptTotpSecret(ciphertext)).toBe(secret);
  });

  it('throws on malformed ciphertext rather than returning it as-is', () => {
    expect(() => decryptTotpSecret('not-our-ciphertext-shape')).toThrow();
  });
});

describe('generateBackupCodes', () => {
  it('generates the requested count of unique, formatted codes', () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });
});
