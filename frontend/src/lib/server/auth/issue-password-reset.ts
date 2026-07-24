// Shared body of "issue a PASSWORD_RESET verification code + email" — used
// by both the anonymous /api/auth/forgot-password route and the authed
// staff-invite route (/api/organizations/current/members POST).
//
// Deliberately NOT the anonymous forgot-password route itself: that route's
// per-email rate limit (`auth:forgot`, 3/hour) and enumeration-resistance
// timing floor target unauthenticated callers probing for valid emails.
// Neither applies to an authed clinic OWNER inviting a colleague they
// already know exists — reusing the HTTP route (and its rate limiter) would
// wrongly burn that budget and add meaningless latency.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { generateVerificationCode } from '@/lib/server/auth';
import { enqueueOutbox } from '@/lib/server/outbox';

const VERIFICATION_TTL_MS = Number(process.env.AUTH_VERIFICATION_TTL_MIN ?? 15) * 60 * 1000;

export async function issuePasswordReset(
  tx: Prisma.TransactionClient,
  input: { userId: string; email: string },
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  await tx.verificationCode.create({
    data: {
      userId: input.userId,
      code,
      type: 'PASSWORD_RESET',
      expiresAt,
    },
  });
  await enqueueOutbox(tx, {
    kind: 'email.password_reset',
    payload: {
      to: input.email,
      code,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return { code, expiresAt };
}
