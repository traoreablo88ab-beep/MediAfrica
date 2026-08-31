import { describe, it, expect } from 'vitest';
import { encryptSensitive, decryptSensitive } from './sensitive-fields';

describe('patient sensitive-field encryption', () => {
  it('round-trips a value through encrypt then decrypt', () => {
    const ciphertext = encryptSensitive('Allergie à la pénicilline');
    expect(ciphertext).not.toBe('Allergie à la pénicilline');
    expect(decryptSensitive(ciphertext)).toBe('Allergie à la pénicilline');
  });

  it('produces the iv:tag:data ciphertext shape', () => {
    const ciphertext = encryptSensitive('RAMED-12345');
    expect(ciphertext.split(':')).toHaveLength(3);
  });

  it('decrypt tolerates legacy plaintext (pre-encryption rows) instead of throwing', () => {
    expect(decryptSensitive('Diabète type 2')).toBe('Diabète type 2');
    expect(decryptSensitive('')).toBe('');
  });
});
