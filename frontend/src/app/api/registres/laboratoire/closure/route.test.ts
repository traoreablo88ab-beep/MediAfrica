import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/registres/laboratoire/closure', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/registres/laboratoire/closure'));
    expect(res.status).toBe(401);
  });

  it('defaults to the current month; closed=false when no closure row', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('http://test/api/registres/laboratoire/closure'));
    const body = await res.json();
    expect(body).toEqual({ month: '2026-01', closed: false, closedAt: null, closedByName: null });
  });

  it('?month= overrides the default', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue(null);
    await GET(makeGet('http://test/api/registres/laboratoire/closure?month=2025-12'));
    const args = prismaMock.registerClosure.findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      organizationId_registerType_month: {
        organizationId: 'org-1',
        registerType: 'laboratoire',
        month: '2025-12',
      },
    });
  });

  it('closed=true with closedAt + closedByName when a closure row exists', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({
      id: 'rc-1',
      registerType: 'laboratoire',
      month: '2026-01',
      closedAt: new Date('2026-02-01T08:00:00Z'),
      closedById: 'user-1',
      closedBy: { name: 'Amadou Diallo', email: 'staff@example.com' },
      createdAt: new Date('2026-02-01T08:00:00Z'),
    } as never);
    const res = await GET(makeGet('http://test/api/registres/laboratoire/closure'));
    const body = await res.json();
    expect(body.closed).toBe(true);
    expect(body.closedAt).toBe('2026-02-01T08:00:00.000Z');
    expect(body.closedByName).toBe('Amadou Diallo');
  });

  it('falls back to email when closedBy has no name', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({
      id: 'rc-1',
      registerType: 'laboratoire',
      month: '2026-01',
      closedAt: new Date('2026-02-01T08:00:00Z'),
      closedById: 'user-1',
      closedBy: { name: null, email: 'staff@example.com' },
      createdAt: new Date('2026-02-01T08:00:00Z'),
    } as never);
    const res = await GET(makeGet('http://test/api/registres/laboratoire/closure'));
    const body = await res.json();
    expect(body.closedByName).toBe('staff@example.com');
  });
});
