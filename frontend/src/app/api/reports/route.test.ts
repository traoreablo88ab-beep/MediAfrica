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
import { POST } from './route';

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

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/reports', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost({ category: 'bug', message: 'Ça ne marche pas.' }));
    expect(res.status).toBe(403);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('401 when requireOrgMember bails (any staff member, not just OWNER/ADMIN, may report)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await POST(makePost({ category: 'bug', message: 'x' }));
    expect(res.status).toBe(403);
  });

  it('400 VALIDATION_FAILED on an invalid category', async () => {
    const res = await POST(makePost({ category: 'invalid', message: 'x' }));
    expect(res.status).toBe(400);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED on an empty message', async () => {
    const res = await POST(makePost({ category: 'bug', message: '' }));
    expect(res.status).toBe(400);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('creates a report scoped to the caller organization and reporter', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rep-1', status: 'OPEN' } as never);

    const res = await POST(makePost({ category: 'billing', message: 'Facture incorrecte.' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 'rep-1', status: 'OPEN' });
    expect(prismaMock.report.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        reporterId: 'user-1',
        category: 'billing',
        message: 'Facture incorrecte.',
      },
    });
  });
});
