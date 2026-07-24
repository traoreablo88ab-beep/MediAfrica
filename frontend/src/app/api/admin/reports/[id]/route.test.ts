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
    req: new NextRequest(`http://test/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

function existingReport(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'rep-1', status: 'OPEN', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe('PATCH /api/admin/reports/[id]', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const { req, ctx } = makePatch('rep-1', { status: 'RESOLVED' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.report.update).not.toHaveBeenCalled();
  });

  it('404 REPORT_NOT_FOUND when missing', async () => {
    prismaMock.report.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePatch('missing', { status: 'RESOLVED' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('REPORT_NOT_FOUND');
  });

  it('resolves a report and stamps resolvedAt', async () => {
    prismaMock.report.findUnique.mockResolvedValue(existingReport() as never);
    prismaMock.report.update.mockResolvedValue(existingReport({ status: 'RESOLVED' }) as never);

    const { req, ctx } = makePatch('rep-1', { status: 'RESOLVED' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const args = prismaMock.report.update.mock.calls[0]?.[0];
    expect(args?.data).toMatchObject({ status: 'RESOLVED' });
    expect(args?.data?.resolvedAt).toBeInstanceOf(Date);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'report.status_update', targetId: 'rep-1' }),
    );
  });

  it('reopening clears resolvedAt', async () => {
    prismaMock.report.findUnique.mockResolvedValue(existingReport({ status: 'RESOLVED' }) as never);
    prismaMock.report.update.mockResolvedValue(existingReport({ status: 'OPEN' }) as never);

    const { req, ctx } = makePatch('rep-1', { status: 'OPEN' });
    await PATCH(req, ctx);

    const args = prismaMock.report.update.mock.calls[0]?.[0];
    expect(args?.data).toMatchObject({ status: 'OPEN', resolvedAt: null });
  });

  it('400 VALIDATION_FAILED on invalid status', async () => {
    const { req, ctx } = makePatch('rep-1', { status: 'BOGUS' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    expect(prismaMock.report.update).not.toHaveBeenCalled();
  });
});
