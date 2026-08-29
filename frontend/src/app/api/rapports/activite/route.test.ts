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

function mockAllEmpty() {
  prismaMock.consultation.findMany.mockResolvedValue([]);
  prismaMock.hospitalisation.findMany.mockResolvedValue([]);
  prismaMock.maternite.findMany.mockResolvedValue([]);
  prismaMock.nutrition.findMany.mockResolvedValue([]);
  prismaMock.planificationFamiliale.findMany.mockResolvedValue([]);
  prismaMock.vaccination.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  mockAllEmpty();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/rapports/activite', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/rapports/activite'));
    expect(res.status).toBe(401);
  });

  it('invalid year → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/rapports/activite?year=not-a-year'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('defaults to the current year when no ?year= is given', async () => {
    const res = await GET(makeGet('http://test/api/rapports/activite'));
    const body = await res.json();
    expect(body.year).toBe(2026);
  });

  it('scopes every query to the org and the requested year', async () => {
    await GET(makeGet('http://test/api/rapports/activite?year=2025'));

    const consultationArgs = prismaMock.consultation.findMany.mock.calls[0]?.[0];
    expect(consultationArgs?.where).toEqual({
      patient: { organizationId: 'org-1' },
      date: { gte: new Date(2025, 0, 1), lt: new Date(2026, 0, 1) },
    });

    const cpnArgs = prismaMock.maternite.findMany.mock.calls[0]?.[0];
    expect(cpnArgs?.where).toMatchObject({
      patient: { organizationId: 'org-1' },
      type: 'CPN',
    });
  });

  it('returns all 10 categories with 12-length monthly arrays, all-zero when empty', async () => {
    const res = await GET(makeGet('http://test/api/rapports/activite?year=2025'));
    const body = await res.json();
    expect(body.categories).toHaveLength(10);
    expect(body.categories.map((c: { key: string }) => c.key)).toEqual([
      'consultations',
      'hospitalisations',
      'cpn',
      'accouchements',
      'cpon',
      'ureni',
      'urenas',
      'urenam',
      'pf',
      'vaccination',
    ]);
    for (const category of body.categories) {
      expect(category.monthly).toHaveLength(12);
      expect(category.monthly.every((n: number) => n === 0)).toBe(true);
    }
  });

  it('buckets consultation dates into the right months', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      { date: new Date(2025, 0, 5) },
      { date: new Date(2025, 0, 20) },
      { date: new Date(2025, 2, 1) },
    ] as never);

    const res = await GET(makeGet('http://test/api/rapports/activite?year=2025'));
    const body = await res.json();
    const consultations = body.categories.find((c: { key: string }) => c.key === 'consultations');
    expect(consultations.monthly).toEqual([2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('separates hospitalisations by dateHeureEntree, not date', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([
      { dateHeureEntree: new Date(2025, 5, 10) },
    ] as never);

    const res = await GET(makeGet('http://test/api/rapports/activite?year=2025'));
    const body = await res.json();
    const hospitalisations = body.categories.find(
      (c: { key: string }) => c.key === 'hospitalisations',
    );
    expect(hospitalisations.monthly).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });
});
