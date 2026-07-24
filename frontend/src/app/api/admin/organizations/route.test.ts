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

function orgRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'org-1',
    slug: 'centre-a',
    name: 'Centre A',
    owner: { email: 'owner@test.local', name: 'Owner' },
    subscription: {
      status: 'ACTIVE',
      plan: { name: 'Standard', priceAmount: 15000 },
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    },
    _count: { members: 3, patients: 10 },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/organizations', () => {
  it('returns 403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/organizations'));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });

  it('lists organizations with member/patient counts and subscription summary', async () => {
    prismaMock.organization.findMany.mockResolvedValue([orgRow()] as never);
    const res = await GET(makeGet('http://test/api/admin/organizations'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      id: 'org-1',
      name: 'Centre A',
      ownerEmail: 'owner@test.local',
      memberCount: 3,
      patientCount: 10,
      subscription: { status: 'ACTIVE', planName: 'Standard', planPriceAmount: 15000 },
    });
  });

  it('handles an organization with no subscription', async () => {
    prismaMock.organization.findMany.mockResolvedValue([orgRow({ subscription: null })] as never);
    const res = await GET(makeGet('http://test/api/admin/organizations'));
    const body = await res.json();
    expect(body.items[0].subscription).toBeNull();
  });

  it('?q= filters by name (case-insensitive)', async () => {
    prismaMock.organization.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/admin/organizations?q=Bamako'));
    const args = prismaMock.organization.findMany.mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ name: { contains: 'Bamako', mode: 'insensitive' } });
  });

  it('rate limit propagates 429', async () => {
    mockRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'TOO_MANY' }, { status: 429 }));
    const res = await GET(makeGet('http://test/api/admin/organizations'));
    expect(res.status).toBe(429);
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });
});
