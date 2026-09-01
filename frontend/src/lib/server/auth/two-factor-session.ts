import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { JWT_SECRET_BYTES } from '@/lib/server/auth';

// Carries "this login attempt already passed password verification, for
// user X" from POST /api/auth/login to POST /api/auth/2fa/verify, without
// touching lib/server/auth.ts (PROTECTED). Reuses its exported
// JWT_SECRET_BYTES so this doesn't need its own secret, but the `purpose`
// claim is load-bearing: it's what stops this short-lived, narrowly-scoped
// token from ever being confused with (or misused as) a real access token,
// even though both are signed with the same key material.

const PENDING_TOKEN_EXPIRY = '5m';
const PENDING_COOKIE_MAX_AGE = 5 * 60; // seconds, matches PENDING_TOKEN_EXPIRY
const PENDING_TOKEN_PURPOSE = 'totp-pending';

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
export const PENDING_2FA_COOKIE = `${COOKIE_PREFIX}-2fa-pending`;
const PENDING_2FA_COOKIE_PATH = '/api/auth/2fa';

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function mintPendingTwoFactorToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: PENDING_TOKEN_PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(PENDING_TOKEN_EXPIRY)
    .sign(JWT_SECRET_BYTES);
}

export async function verifyPendingTwoFactorToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_BYTES);
    if (payload.purpose !== PENDING_TOKEN_PURPOSE) return null;
    const sub = payload.sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

export async function setPendingTwoFactorCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    maxAge: PENDING_COOKIE_MAX_AGE,
    path: PENDING_2FA_COOKIE_PATH,
  });
}

export async function clearPendingTwoFactorCookie(): Promise<void> {
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, '', {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    maxAge: 0,
    path: PENDING_2FA_COOKIE_PATH,
  });
}
