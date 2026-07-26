// POST /api/registres/maternite/cpon/close — manually close a month's CPoN
// register. Any authenticated staff member can close (no ADMIN gate —
// matches the rest of Patients/Consultations, not back-office). Once
// closed, POST /api/patients/[id]/maternite refuses new CPoN entries for
// that month with REGISTER_CLOSED (see lib/server/registers/closure.ts).
// Closing this register does not affect the other two maternité registers
// or the consultation register.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscriptions/access-guard';
import { prisma } from '@/lib/server/prisma';
import { monthKey } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REGISTER_TYPE = 'maternite-cpon';

const CloseBody = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const subFail = await requireActiveSubscription(auth.orgMember.organizationId);
    if (subFail) {
      subFail.headers.set('x-request-id', ctx.requestId);
      return subFail;
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = CloseBody.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const month = parsed.data.month ?? monthKey(new Date());
    const organizationId = auth.orgMember.organizationId;

    const existing = await prisma.registerClosure.findUnique({
      where: {
        organizationId_registerType_month: { organizationId, registerType: REGISTER_TYPE, month },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'ALREADY_CLOSED', message: 'This month is already closed.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const closure = await prisma.registerClosure.create({
      data: { organizationId, registerType: REGISTER_TYPE, month, closedById: auth.user.sub },
    });

    return NextResponse.json(
      { month: closure.month, closedAt: closure.closedAt.toISOString() },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
