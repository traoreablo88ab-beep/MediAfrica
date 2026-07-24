import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function reportRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rep-1',
    organization: { id: 'org-1', name: 'Centre A' },
    reporter: { email: 'staff@test.local', name: 'Staff' },
    category: 'bug',
    message: 'Le bouton ne fonctionne pas.',
    status: 'OPEN',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    resolvedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/reports', () => {
  it('returns 403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(403);
  });

  it('lists reports with organization and reporter info', async () => {
    prismaMock.report.findMany.mockResolvedValue([reportRow()] as never);
    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      id: 'rep-1',
      organizationId: 'org-1',
      organizationName: 'Centre A',
      reporterEmail: 'staff@test.local',
      category: 'bug',
      status: 'OPEN',
    });
  });

  it('?status=OPEN filters by status', async () => {
    prismaMock.report.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/admin/reports?status=OPEN'));
    const args = prismaMock.report.findMany.mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ status: 'OPEN' });
  });
});
