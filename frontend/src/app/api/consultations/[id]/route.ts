// PATCH /api/consultations/[id] — update a consultation's status. This is
// the only mutation the Consultations queue page needs: moving a patient
// through attente → consultation → traite (or urgent) as staff work the
// queue. Full clinical fields (diagnostic, traitement…) are still written
// via POST /api/patients/[id]/consultations at creation time.
// DELETE /api/consultations/[id] — removes a wrongly-created consultation
// entry (wrong patient selected, duplicate entry). Same month-closure guard
// as PATCH so a closed register stays immutable.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { isMonthClosed } from '@/lib/server/registers/closure';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchConsultationBody = z.object({
  status: z.enum(['attente', 'consultation', 'traite', 'urgent']),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const parsed = PatchConsultationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.consultation.findFirst({
      where: { id, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'CONSULTATION_NOT_FOUND', message: 'Consultation not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (await isMonthClosed(prisma, auth.orgMember.organizationId, 'consultation', existing.date)) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The consultation register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.consultation.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    return NextResponse.json(
      { id: updated.id, status: updated.status },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const existing = await prisma.consultation.findFirst({
      where: { id, patient: { organizationId: auth.orgMember.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'CONSULTATION_NOT_FOUND', message: 'Consultation not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (await isMonthClosed(prisma, auth.orgMember.organizationId, 'consultation', existing.date)) {
      return NextResponse.json(
        {
          error: 'REGISTER_CLOSED',
          message: 'The consultation register for this month is closed.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.consultation.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
