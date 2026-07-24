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
vi.mock('@/lib/server/auth/issue-password-reset', () => ({
  issuePasswordReset: vi.fn().mockResolvedValue({ code: '12345678', expiresAt: new Date() }),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

import { requireOrgMember } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { issuePasswordReset } from '@/lib/server/auth/issue-password-reset';
import { GET, POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockIssuePasswordReset = vi.mocked(issuePasswordReset);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'owner@test.local' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/organizations/current/members', { method: 'GET' });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/organizations/current/members', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgMember.mockResolvedValue(ctxWith('OWNER'));
  mockVerifyCsrf.mockReturnValue(null);
  mockIssuePasswordReset.mockResolvedValue({ code: '12345678', expiresAt: new Date() });
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/organizations/current/members', () => {
  it('returns 401 when requireOrgMember bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('lists members scoped to the caller organization', async () => {
    prismaMock.organizationMember.findMany.mockResolvedValue([
      {
        role: 'OWNER',
        user: {
          id: 'u1',
          email: 'owner@test.local',
          name: 'Owner',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({ id: 'u1', email: 'owner@test.local', role: 'OWNER' });
    const args = prismaMock.organizationMember.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ organizationId: 'org-1' });
  });
});

describe('POST /api/organizations/current/members', () => {
  it('403 on missing CSRF token', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost({ email: 'new@test.local' }));
    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER trying to invite', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await POST(makePost({ email: 'new@test.local' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED on an invalid email', async () => {
    const res = await POST(makePost({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('409 EMAIL_ALREADY_REGISTERED when the email is taken', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing' } as never);
    const res = await POST(makePost({ email: 'taken@test.local' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('EMAIL_ALREADY_REGISTERED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('creates a pre-verified user + MEMBER row and issues a password-reset code via the shared helper', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-new' } as never);

    const res = await POST(makePost({ email: 'new@test.local', role: 'MEMBER' }));

    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new@test.local' }),
      }),
    );
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', userId: 'u-new', role: 'MEMBER' },
    });
    expect(mockIssuePasswordReset).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'u-new', email: 'new@test.local' }),
    );
  });

  it('ADMIN role can also invite', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN'));
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-new2' } as never);

    const res = await POST(makePost({ email: 'new2@test.local' }));
    expect(res.status).toBe(201);
  });
});
