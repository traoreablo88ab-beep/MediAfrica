// POST /api/auth/2fa/verify — completes a login that was withheld by the
// totpEnabledAt gate in POST /api/auth/login (AUTH-02).
//
// Pre-session route, modeled on verify-email/route.ts: no CSRF cookie exists
// yet, so it's set HERE on success, same carve-out. Reads the pending-2FA
// cookie minted by login (see lib/server/auth/two-factor-session.ts) rather
// than trusting a client-supplied userId. Accepts either the current TOTP
// code or one of the account's single-use backup codes; either failure path
// counts against the SAME lockout counter as a wrong password (D-07) — a 2FA
// code is just another authentication factor for the same account.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
  verifyPassword,
} from '@/lib/server/auth';
import { isLockedOut, recordFailure, recordSuccess } from '@/lib/server/auth/lockout';
import {
  PENDING_2FA_COOKIE,
  verifyPendingTwoFactorToken,
  clearPendingTwoFactorCookie,
} from '@/lib/server/auth/two-factor-session';
import { decryptTotpSecret, verifyTotpCode } from '@/lib/server/auth/totp';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  code: z.string().trim().min(1),
});

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'auth:2fa-verify',
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_2FA_VERIFY_RATE_LIMIT_MAX ?? 10),
    code: 'TOO_MANY_2FA_ATTEMPTS',
    message: 'Too many 2FA attempts. Try again later.',
  },
);

function invalidSession(ctx: { requestId: string }): NextResponse {
  const res = NextResponse.json(
    { error: 'TOTP_SESSION_EXPIRED', message: 'Please log in again.' },
    { status: 400 },
  );
  res.headers.set('x-request-id', ctx.requestId);
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const pendingCookie = req.cookies.get(PENDING_2FA_COOKIE)?.value;
    if (!pendingCookie) return invalidSession(ctx);
    const userId = await verifyPendingTwoFactorToken(pendingCookie);
    if (!userId) return invalidSession(ctx);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, tokenVersion: true, totpSecret: true, totpEnabledAt: true },
    });
    if (!user || !user.totpEnabledAt || !user.totpSecret) return invalidSession(ctx);

    const rateFail = await limiter.check(req, user.email);
    if (rateFail) return rateFail;

    if (await isLockedOut(user.email)) {
      const res = NextResponse.json(
        { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
        { status: 423 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    let matched = verifyTotpCode(parsed.data.code, decryptTotpSecret(user.totpSecret));

    if (!matched) {
      const backupCodes = await prisma.totpBackupCode.findMany({
        where: { userId: user.id, usedAt: null },
        select: { id: true, codeHash: true },
      });
      for (const backupCode of backupCodes) {
        if (await verifyPassword(parsed.data.code, backupCode.codeHash)) {
          // TOCTOU guard: only one concurrent request can win the consume.
          const consumed = await prisma.totpBackupCode.updateMany({
            where: { id: backupCode.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          matched = consumed.count === 1;
          break;
        }
      }
    }

    if (!matched) {
      const r = await recordFailure(user.email);
      const res = NextResponse.json(
        r.locked
          ? { error: 'LOCKED_OUT', message: 'Account temporarily locked.' }
          : { error: 'TOTP_CODE_INVALID', message: 'Invalid code.' },
        { status: r.locked ? 423 : 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    await recordSuccess(user.email);
    await clearPendingTwoFactorCookie();

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    log.info('2fa verify success', { userId: user.id });
    const res = NextResponse.json({ ok: true, user: { sub: user.id, email: user.email } });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
