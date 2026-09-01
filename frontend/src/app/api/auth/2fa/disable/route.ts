// POST /api/auth/2fa/disable — turn off TOTP for the caller's own account.
//
// Any authenticated user (not role-gated — a demoted former admin who still
// has totpEnabledAt set must still be able to turn it off). Requires the
// account password again: a hijacked session (e.g. XSS with cookie access
// but no password) must not be able to silently strip 2FA protection.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, verifyPassword } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  password: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid password.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.user.sub },
        data: { totpSecret: null, totpEnabledAt: null },
      });
      await tx.totpBackupCode.deleteMany({ where: { userId: auth.user.sub } });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
