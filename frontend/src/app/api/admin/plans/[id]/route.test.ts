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
    req: new NextRequest(`http://test/api/admin/plans/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

function existingPlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'plan-1',
    name: 'Standard',
    priceAmount: 15000,
    currency: 'XOF',
    billingIntervalDays: 30,
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe('PATCH /api/admin/plans/[id]', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const { req, ctx } = makePatch('plan-1', { priceAmount: 20000 });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.plan.update).not.toHaveBeenCalled();
  });

  it('404 PLAN_NOT_FOUND when the plan does not exist', async () => {
    prismaMock.plan.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePatch('missing', { priceAmount: 20000 });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PLAN_NOT_FOUND');
  });

  it('400 VALIDATION_FAILED on a negative price', async () => {
    const { req, ctx } = makePatch('plan-1', { priceAmount: -1 });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    expect(prismaMock.plan.update).not.toHaveBeenCalled();
  });

  it('updates the price forward-only (does not touch Subscription rows) and logs the change', async () => {
    prismaMock.plan.findUnique.mockResolvedValue(existingPlan() as never);
    prismaMock.plan.update.mockResolvedValue(existingPlan({ priceAmount: 20000 }) as never);

    const { req, ctx } = makePatch('plan-1', { priceAmount: 20000 });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.priceAmount).toBe(20000);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'plan.update',
        metadata: {
          from: { priceAmount: 15000, isActive: true },
          to: { priceAmount: 20000, isActive: true },
        },
      }),
    );
  });

  it('can archive a plan via isActive', async () => {
    prismaMock.plan.findUnique.mockResolvedValue(existingPlan() as never);
    prismaMock.plan.update.mockResolvedValue(existingPlan({ isActive: false }) as never);

    const { req, ctx } = makePatch('plan-1', { isActive: false });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(false);
  });
});
