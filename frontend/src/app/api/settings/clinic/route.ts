// GET /api/settings/clinic — the CALLER's own clinic display name and
// declared horaires (heureOuverture/heureFermeture/joursFermeture — the
// reference baseline the Guichet "hors horaires" (§ 6.2) and "inactivité"
// (§ 6.4) alert rules check against; null/[] = not declared, those rules
// stay no-ops). Auth-required (multi-tenant: there's no longer one
// universal "the" clinic to show pre-login — /login and /signup show
// static branding instead, see AppHeader/login/signup pages).
//
// PATCH /api/settings/clinic — rename the caller's own clinic and/or
// declare its horaires. Requires OWNER or ADMIN org role (MEMBER staff
// can't change these).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgMember } from '@/lib/server/middleware';
import { ORG_ROLE_RANK } from '@/lib/server/middleware/require-org-role';
import { prisma } from '@/lib/server/prisma';
import { WEEKDAY_NAMES_FR } from '@/lib/server/guichet/alertes';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DEFAULT_NAME = 'CSRéf Bamako V';
const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  heureOuverture: z.string().regex(HEURE_RE).nullable().optional(),
  heureFermeture: z.string().regex(HEURE_RE).nullable().optional(),
  joursFermeture: z.array(z.enum(WEEKDAY_NAMES_FR)).optional(),
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
      {
        name: settings?.name ?? DEFAULT_NAME,
        heureOuverture: settings?.heureOuverture ?? null,
        heureFermeture: settings?.heureFermeture ?? null,
        joursFermeture: settings?.joursFermeture ?? [],
      },
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

    const d = parsed.data;
    const updated = await prisma.clinicSettings.upsert({
      where: { organizationId: auth.orgMember.organizationId },
      create: {
        organizationId: auth.orgMember.organizationId,
        name: d.name,
        heureOuverture: d.heureOuverture ?? null,
        heureFermeture: d.heureFermeture ?? null,
        joursFermeture: d.joursFermeture ?? [],
      },
      update: {
        name: d.name,
        ...(d.heureOuverture !== undefined ? { heureOuverture: d.heureOuverture } : {}),
        ...(d.heureFermeture !== undefined ? { heureFermeture: d.heureFermeture } : {}),
        ...(d.joursFermeture !== undefined ? { joursFermeture: d.joursFermeture } : {}),
      },
    });

    return NextResponse.json(
      {
        name: updated.name,
        heureOuverture: updated.heureOuverture,
        heureFermeture: updated.heureFermeture,
        joursFermeture: updated.joursFermeture,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
