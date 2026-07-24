// GET /api/settings/clinic — the CALLER's own clinic display name.
// Auth-required (multi-tenant: there's no longer one universal "the"
// clinic to show pre-login — /login and /signup show static branding
// instead, see AppHeader/login/signup pages).
//
// PATCH /api/settings/clinic — rename the caller's own clinic. Requires
// OWNER or ADMIN org role (MEMBER staff can't rename their clinic).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DEFAULT_NAME = 'CSRéf Bamako V';

const Body = z.object({
  name: z.string().trim().min(1).max(200),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    const settings = await prisma.clinicSettings.findUnique({
      where: { organizationId: auth.orgMember.organizationId },
    });
    return NextResponse.json(
      { name: settings?.name ?? DEFAULT_NAME },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireOrgMember();
    if (auth instanceof NextResponse) return auth;

    if (ORG_ROLE_RANK[auth.orgMember.role] < ORG_ROLE_RANK.ADMIN) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400 },
      );
    }

    const updated = await prisma.clinicSettings.upsert({
      where: { organizationId: auth.orgMember.organizationId },
      create: { organizationId: auth.orgMember.organizationId, name: parsed.data.name },
      update: { name: parsed.data.name },
    });

    return NextResponse.json(
      { name: updated.name },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
