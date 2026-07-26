import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

import { requireOrgMember } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const authedCtx = {
  user: { sub: 'user-1', email: 'staff@test.local' },
  orgMember: { organizationId: 'org-1', role: 'MEMBER' as const },
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/reports', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost({ category: 'general', message: 'Très pratique.' }));
    expect(res.status).toBe(403);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('401 when requireOrgMember bails (any staff member, not just OWNER/ADMIN, may comment)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await POST(makePost({ category: 'general', message: 'x' }));
    expect(res.status).toBe(403);
  });

  it('400 VALIDATION_FAILED on an invalid category', async () => {
    const res = await POST(makePost({ category: 'bug', message: 'x' }));
    expect(res.status).toBe(400);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED on an empty message', async () => {
    const res = await POST(makePost({ category: 'general', message: '' }));
    expect(res.status).toBe(400);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED on a rating outside 1-5', async () => {
    const res = await POST(makePost({ category: 'general', message: 'x', rating: 6 }));
    expect(res.status).toBe(400);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('creates a comment scoped to the caller organization and reporter, with an optional rating', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rep-1' } as never);

    const res = await POST(
      makePost({
        category: 'registres',
        message: 'Le registre met du temps à charger.',
        rating: 3,
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 'rep-1' });
    expect(prismaMock.report.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        reporterId: 'user-1',
        category: 'registres',
        message: 'Le registre met du temps à charger.',
        rating: 3,
      },
    });
  });

  it('defaults rating to null when omitted', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rep-2' } as never);
    await POST(makePost({ category: 'autre', message: 'Une idée en vrac.' }));
    expect(prismaMock.report.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        reporterId: 'user-1',
        category: 'autre',
        message: 'Une idée en vrac.',
        rating: null,
      },
    });
  });
});

describe('GET /api/reports', () => {
  it('401 when requireOrgMember bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/reports'));
    expect(res.status).toBe(403);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.report.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/reports'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('scopes the query to the caller organization only (not platform-wide)', async () => {
    prismaMock.report.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/reports'));
    const args = prismaMock.report.findMany.mock.calls[0]?.[0];
    expect(args?.where?.organizationId).toBe('org-1');
  });

  it('serializes rows including rating and the admin reply, when present', async () => {
    prismaMock.report.findMany.mockResolvedValue([
      {
        id: 'rep-1',
        category: 'autre',
        message: 'Très pratique, merci !',
        rating: 5,
        adminResponse: 'Merci pour le retour !',
        adminRespondedAt: new Date('2026-01-13T09:00:00Z'),
        createdAt: new Date('2026-01-12T07:45:00Z'),
        reporter: { email: 'staff@test.local', name: 'Awa Diarra' },
      },
    ] as never);
    const res = await GET(makeGet('http://test/api/reports'));
    const body = await res.json();
    expect(body.items[0]).toEqual({
      id: 'rep-1',
      reporterEmail: 'staff@test.local',
      reporterName: 'Awa Diarra',
      category: 'autre',
      message: 'Très pratique, merci !',
      rating: 5,
      adminResponse: 'Merci pour le retour !',
      adminRespondedAt: '2026-01-13T09:00:00.000Z',
      createdAt: '2026-01-12T07:45:00.000Z',
    });
  });

  it('serializes null rating/adminResponse as null, not undefined', async () => {
    prismaMock.report.findMany.mockResolvedValue([
      {
        id: 'rep-2',
        category: 'patients',
        message: 'Suggestion de champ.',
        rating: null,
        adminResponse: null,
        adminRespondedAt: null,
        createdAt: new Date('2026-01-12T07:45:00Z'),
        reporter: { email: 'staff@test.local', name: null },
      },
    ] as never);
    const res = await GET(makeGet('http://test/api/reports'));
    const body = await res.json();
    expect(body.items[0].rating).toBeNull();
    expect(body.items[0].adminResponse).toBeNull();
    expect(body.items[0].adminRespondedAt).toBeNull();
  });
});
