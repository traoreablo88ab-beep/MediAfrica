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
import { GET, POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/plans', { method: 'GET' });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function planRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'plan-1',
    name: 'Standard',
    priceAmount: 15000,
    currency: 'XOF',
    billingIntervalDays: 30,
    isActive: true,
    _count: { subscriptions: 5 },
    createdAt: new Date('2026-01-01T00:00:00Z'),
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

describe('GET /api/admin/plans', () => {
  it('returns 403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('lists plans with subscriber counts', async () => {
    prismaMock.plan.findMany.mockResolvedValue([planRow()] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      id: 'plan-1',
      priceAmount: 15000,
      subscriberCount: 5,
    });
  });
});

describe('POST /api/admin/plans', () => {
  it('returns 403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost({ name: 'Pro', priceAmount: 25000 }));
    expect(res.status).toBe(403);
    expect(prismaMock.plan.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED on invalid body', async () => {
    const res = await POST(makePost({ name: '', priceAmount: -5 }));
    expect(res.status).toBe(400);
    expect(prismaMock.plan.create).not.toHaveBeenCalled();
  });

  it('creates a plan and logs the admin action', async () => {
    prismaMock.plan.create.mockResolvedValue(planRow({ id: 'plan-2', name: 'Pro' }) as never);
    const res = await POST(makePost({ name: 'Pro', priceAmount: 25000 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 'plan-2', name: 'Pro', priceAmount: 15000 });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'admin-1', action: 'plan.create', targetType: 'Plan' }),
    );
  });
});
