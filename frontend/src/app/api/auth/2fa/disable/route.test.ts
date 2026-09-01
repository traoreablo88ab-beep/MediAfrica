import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyPassword: vi.fn(),
  };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyPassword } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyPassword = vi.mocked(verifyPassword);

const userCtx = { user: { sub: 'u1', email: 'user@test.local' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/auth/2fa/disable', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx);
  mockVerifyPassword.mockResolvedValue(false);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/2fa/disable', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ password: 'whatever' }));
    expect(res.status).toBe(401);
  });

  it('returns INVALID_CREDENTIALS on wrong password, does not touch 2FA rows', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ passwordHash: 'hash' } as never);
    mockVerifyPassword.mockResolvedValue(false);

    const res = await POST(makePost({ password: 'wrong' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_CREDENTIALS');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.totpBackupCode.deleteMany).not.toHaveBeenCalled();
  });

  it('returns INVALID_CREDENTIALS when the account has no passwordHash (OAuth-only)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ passwordHash: null } as never);
    const res = await POST(makePost({ password: 'whatever' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_CREDENTIALS');
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it('happy path: correct password clears totpSecret/totpEnabledAt and deletes backup codes', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ passwordHash: 'hash' } as never);
    mockVerifyPassword.mockResolvedValue(true);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.totpBackupCode.deleteMany.mockResolvedValue({ count: 10 } as never);

    const res = await POST(makePost({ password: 'correct-horse' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { totpSecret: null, totpEnabledAt: null },
    });
    expect(prismaMock.totpBackupCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
