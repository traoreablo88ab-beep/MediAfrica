import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
// hashPassword runs real bcrypt (cost 12) — mocked here since confirm hashes
// 10 backup codes per call; keep verifyCsrf real (imported alongside).
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
  };
});

import { requireAdmin } from '@/lib/server/middleware';
import { generateTotpSecret, encryptTotpSecret } from '@/lib/server/auth/totp';
import { authenticator } from 'otplib';
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/auth/2fa/confirm', {
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
  mockRequireAdmin.mockResolvedValue(adminCtx);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/2fa/confirm', () => {
  it('returns 403 when requireAdmin bails', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost({ code: '123456' }));
    expect(res.status).toBe(403);
  });

  it('returns TOTP_SETUP_NOT_STARTED when no secret was ever written', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ totpSecret: null } as never);
    const res = await POST(makePost({ code: '123456' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_SETUP_NOT_STARTED');
  });

  it('returns TOTP_CODE_INVALID for a wrong code, does not enable 2FA', async () => {
    const secret = generateTotpSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      totpSecret: encryptTotpSecret(secret),
    } as never);

    const res = await POST(makePost({ code: '000000' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_CODE_INVALID');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('happy path: correct code enables 2FA and returns 10 backup codes once', async () => {
    const secret = generateTotpSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      totpSecret: encryptTotpSecret(secret),
    } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.totpBackupCode.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.totpBackupCode.createMany.mockResolvedValue({ count: 10 } as never);

    const validToken = authenticator.generate(secret);
    const res = await POST(makePost({ code: validToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.backupCodes).toHaveLength(10);
    expect(new Set(body.backupCodes).size).toBe(10);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { totpEnabledAt: expect.any(Date) },
    });
    expect(prismaMock.totpBackupCode.createMany).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.totpBackupCode.createMany.mock.calls[0]?.[0];
    expect(createArg?.data).toHaveLength(10);
    // Stored hashes must not be the plaintext codes.
    for (const row of createArg!.data as Array<{ userId: string; codeHash: string }>) {
      expect(row.userId).toBe('admin-1');
      expect(body.backupCodes).not.toContain(row.codeHash);
    }
  });
});
