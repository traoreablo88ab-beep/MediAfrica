import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makePatch(id: string, body: unknown) {
  return {
    req: new NextRequest(`http://test/api/admin/subscriptions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

function existingSub(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'sub-1', planId: 'plan-1', status: 'PAST_DUE', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe('PATCH /api/admin/subscriptions/[id]', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const { req, ctx } = makePatch('sub-1', { status: 'ACTIVE' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('404 SUBSCRIPTION_NOT_FOUND when missing', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePatch('missing', { status: 'ACTIVE' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  it('404 PLAN_NOT_FOUND when overriding to a nonexistent plan', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(existingSub() as never);
    prismaMock.plan.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePatch('sub-1', { planId: 'plan-missing' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PLAN_NOT_FOUND');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('manually reactivates a subscription (support override) and logs the action', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(existingSub() as never);
    prismaMock.subscription.update.mockResolvedValue(existingSub({ status: 'ACTIVE' }) as never);

    const { req, ctx } = makePatch('sub-1', { status: 'ACTIVE' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ACTIVE');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'subscription.update', targetId: 'sub-1' }),
    );
  });

  it('changes the plan when planId is valid', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(existingSub() as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: 'plan-2' } as never);
    prismaMock.subscription.update.mockResolvedValue(existingSub({ planId: 'plan-2' }) as never);

    const { req, ctx } = makePatch('sub-1', { planId: 'plan-2' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.planId).toBe('plan-2');
  });
});
