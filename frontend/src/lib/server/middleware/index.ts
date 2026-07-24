/**
 * Higher-order helpers callable from Next.js route handlers. Each one
 * either:
 *   - returns a NextResponse 4xx to short-circuit the handler, OR
 *   - returns the resolved auth context the handler needs.
 *
 * Example:
 *   export async function POST(req: NextRequest) {
 *     const csrfFail = verifyCsrf(req);
 *     if (csrfFail) return csrfFail;
 *     const auth = await requireAuth();
 *     if (auth instanceof NextResponse) return auth;
 *     // …handler logic with `auth.user.sub`
 *   }
 *
 * Why not Express-style middleware chains? Next.js route handlers are
 * plain functions; HOFs compose more naturally and keep the type of
 * `req`/`ctx` standard.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '../auth';
import { prisma } from '../prisma';
import type { AdminRole } from './require-admin';
import { roleRank } from './require-admin';
import type { OrgRole } from './require-org-role';
import { ORG_ROLE_RANK } from './require-org-role';

export interface AuthContext {
  user: { sub: string; email: string };
}

export interface AdminContext extends AuthContext {
  admin: { id: string; email: string; role: AdminRole };
}

export interface OrgContext extends AuthContext {
  orgMember: { organizationId: string; userId: string; role: OrgRole };
}

export interface OrgMemberContext extends AuthContext {
  orgMember: { organizationId: string; role: OrgRole };
}

/**
 * Resolve the authenticated user from the cookie / Bearer header. Returns
 * `AuthContext` on success, or a 401 NextResponse on failure.
 *
 * The DB re-query blocks stale-JWT bypass (deleted accounts, bumped
 * tokenVersion).
 */
export async function requireAuth(authHeader?: string | null): Promise<AuthContext | NextResponse> {
  const store = await cookies();
  let token = store.get(COOKIE_NAME)?.value;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const payloadVersion = payload.tokenVersion ?? 0;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, tokenVersion: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  if (user.tokenVersion !== payloadVersion) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
  return { user: { sub: user.id, email: user.email } };
}

/**
 * Soft auth — returns `{ user }` if a valid cookie/Bearer is present,
 * `null` otherwise. Never returns a NextResponse. Use for routes that
 * accept both guests and authenticated callers.
 */
export async function optionalAuth(authHeader?: string | null): Promise<AuthContext | null> {
  const store = await cookies();
  let token = store.get(COOKIE_NAME)?.value;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const payloadVersion = payload.tokenVersion ?? 0;
  const user = await prisma.user
    .findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    })
    .catch(() => null);
  if (!user || user.tokenVersion !== payloadVersion) return null;
  return { user: { sub: user.id, email: user.email } };
}

/**
 * requireAdmin / requireSuperadmin — chain with requireAuth. Re-reads the
 * user role from DB so an in-flight role change is honored on the very
 * next request (no need to wait for the JWT to expire).
 */
export async function requireAdmin(
  minRole: AdminRole = 'ADMIN',
  authHeader?: string | null,
): Promise<AdminContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  const role = (user.role as AdminRole) ?? 'USER';
  if (roleRank(role) < roleRank(minRole)) {
    return NextResponse.json(
      { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
      { status: 403 },
    );
  }
  return {
    user: { sub: user.id, email: user.email },
    admin: { id: user.id, email: user.email, role },
  };
}

export async function requireSuperadmin(
  authHeader?: string | null,
): Promise<AdminContext | NextResponse> {
  return requireAdmin('SUPERADMIN', authHeader);
}

/**
 * requireOrgRole — verifies the authed user belongs to `organizationId`
 * with at least `minRole`. Returns 404 (not 403) for non-members so org
 * existence isn't leaked. Chains requireAuth.
 */
export async function requireOrgRole(
  organizationId: string,
  minRole: OrgRole = 'MEMBER',
  authHeader?: string | null,
): Promise<OrgContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: auth.user.sub } },
    select: { organizationId: true, userId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  const role = membership.role as OrgRole;
  if (ORG_ROLE_RANK[role] < ORG_ROLE_RANK[minRole]) {
    return NextResponse.json(
      { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
      { status: 403 },
    );
  }
  return {
    user: auth.user,
    orgMember: { organizationId: membership.organizationId, userId: membership.userId, role },
  };
}

/**
 * requireOrgMember — MediAfrica multi-tenancy: resolves the CALLER's own
 * organization (every User belongs to exactly one, enforced by
 * OrganizationMember's `@@unique([userId])`). Unlike `requireOrgRole`, no
 * organizationId is passed in — there's nothing in the URL to trust or
 * distrust, which is the point: a route using this can never be tricked
 * into operating on a different clinic's data via a client-supplied id.
 *
 * Returns 403 NO_ORGANIZATION for authenticated users with no membership
 * (e.g. a platform ADMIN/SUPERADMIN account that isn't also clinic staff —
 * use `requireAdmin`/`requireAdminOrgAccess` for those routes instead, never
 * this one).
 */
export async function requireOrgMember(
  authHeader?: string | null,
): Promise<OrgMemberContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const membership = await prisma.organizationMember.findUnique({
    where: { userId: auth.user.sub },
    select: { organizationId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json(
      { error: 'NO_ORGANIZATION', message: 'Account is not linked to a health center.' },
      { status: 403 },
    );
  }
  return {
    user: auth.user,
    orgMember: { organizationId: membership.organizationId, role: membership.role as OrgRole },
  };
}

/**
 * requireAdminOrgAccess — platform-admin read access to a SPECIFIC clinic's
 * data (e.g. /api/admin/organizations/[id]/...). Deliberately separate from
 * `requireOrgMember`: an admin is never implicitly "in" any organization,
 * they explicitly name the one they're inspecting. Chains `requireAdmin`,
 * never touches `OrganizationMember` — keeps the two authorization models
 * (platform back-office vs. clinic staff) from ever overlapping.
 */
export async function requireAdminOrgAccess(
  organizationId: string,
  authHeader?: string | null,
): Promise<AdminContext | NextResponse> {
  const auth = await requireAdmin('ADMIN', authHeader);
  if (auth instanceof NextResponse) return auth;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' },
      { status: 404 },
    );
  }
  return auth;
}
