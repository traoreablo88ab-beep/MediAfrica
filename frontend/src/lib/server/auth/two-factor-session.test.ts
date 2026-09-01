import { describe, it, expect, vi } from 'vitest';
import { SignJWT } from 'jose';
import { JWT_SECRET_BYTES } from '@/lib/server/auth';
import { mintPendingTwoFactorToken, verifyPendingTwoFactorToken } from './two-factor-session';

describe('mintPendingTwoFactorToken / verifyPendingTwoFactorToken', () => {
  it('round-trips the userId', async () => {
    const token = await mintPendingTwoFactorToken('user-123');
    await expect(verifyPendingTwoFactorToken(token)).resolves.toBe('user-123');
  });

  it('rejects a token with the wrong purpose claim (e.g. a real access token)', async () => {
    const accessLikeToken = await new SignJWT({ sub: 'user-123', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(JWT_SECRET_BYTES);
    await expect(verifyPendingTwoFactorToken(accessLikeToken)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    try {
      const token = await mintPendingTwoFactorToken('user-123');
      vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute expiry
      await expect(verifyPendingTwoFactorToken(token)).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a tampered token', async () => {
    const token = await mintPendingTwoFactorToken('user-123');
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    await expect(verifyPendingTwoFactorToken(tampered)).resolves.toBeNull();
  });

  it('rejects a garbage string', async () => {
    await expect(verifyPendingTwoFactorToken('not-a-jwt')).resolves.toBeNull();
  });
});
