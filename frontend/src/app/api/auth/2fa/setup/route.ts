// POST /api/auth/2fa/setup — start (or restart) TOTP enrollment.
//
// ADMIN/SUPERADMIN only (self-service — enrolls the caller's own account).
// Generates a fresh secret and writes it encrypted to User.totpSecret, but
// does NOT set totpEnabledAt — the login gate only checks totpEnabledAt, so
// an abandoned/restarted setup never affects login. Calling this again
// simply overwrites the previous (still-unconfirmed) secret.
export const runtime = 'nodejs';

import 'server-only';
import QRCode from 'qrcode';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { generateTotpSecret, buildOtpauthUri, encryptTotpSecret } from '@/lib/server/auth/totp';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    if (!process.env.ENCRYPTION_KEY) {
      return NextResponse.json(
        {
          error: 'ENCRYPTION_NOT_CONFIGURED',
          message: '2FA is not available on this deployment yet.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: auth.admin.id },
      data: { totpSecret: encryptTotpSecret(secret) },
    });

    const otpauthUri = buildOtpauthUri(secret, auth.admin.email);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

    return NextResponse.json(
      { secret, otpauthUri, qrCodeDataUrl },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
