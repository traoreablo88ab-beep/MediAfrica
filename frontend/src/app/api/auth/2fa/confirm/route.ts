// POST /api/auth/2fa/confirm — complete TOTP enrollment.
//
// ADMIN/SUPERADMIN only. Verifies the code against the secret written by
// /api/auth/2fa/setup, and only on success: sets totpEnabledAt (the sole
// gate the login route checks) and issues 10 single-use backup codes,
// returned in clear ONCE — only their bcrypt hash is stored.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, hashPassword } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { decryptTotpSecret, verifyTotpCode, generateBackupCodes } from '@/lib/server/auth/totp';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  code: z.string().trim().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { totpSecret: true },
    });
    if (!user?.totpSecret) {
      return NextResponse.json(
        {
          error: 'TOTP_SETUP_NOT_STARTED',
          message: 'Start 2FA setup before confirming.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const secret = decryptTotpSecret(user.totpSecret);
    if (!verifyTotpCode(parsed.data.code, secret)) {
      return NextResponse.json(
        { error: 'TOTP_CODE_INVALID', message: 'Invalid code.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const backupCodes = generateBackupCodes();
    const hashedCodes = await Promise.all(backupCodes.map((code) => hashPassword(code)));

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.admin.id },
        data: { totpEnabledAt: new Date() },
      });
      // Confirm can only meaningfully run once per enrollment, but clear any
      // stale codes first in case of a prior disable/re-enroll cycle.
      await tx.totpBackupCode.deleteMany({ where: { userId: auth.admin.id } });
      await tx.totpBackupCode.createMany({
        data: hashedCodes.map((codeHash) => ({ userId: auth.admin.id, codeHash })),
      });
    });

    return NextResponse.json(
      { ok: true, backupCodes },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
