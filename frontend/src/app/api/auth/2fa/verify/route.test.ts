import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth/lockout', () => ({
  isLockedOut: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyPassword: vi.fn(),
  };
});

import { isLockedOut, recordFailure, recordSuccess } from '@/lib/server/auth/lockout';
import { verifyPassword } from '@/lib/server/auth';
import { generateTotpSecret, encryptTotpSecret } from '@/lib/server/auth/totp';
import {
  PENDING_2FA_COOKIE,
  mintPendingTwoFactorToken,
} from '@/lib/server/auth/two-factor-session';
import { authenticator } from 'otplib';
import { POST } from './route';

const mockVerifyPassword = vi.mocked(verifyPassword);

function makeReq(body: unknown, pendingToken?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (pendingToken) headers['cookie'] = `${PENDING_2FA_COOKIE}=${pendingToken}`;
  return new NextRequest('http://test/api/auth/2fa/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const SECRET = generateTotpSecret();

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  vi.mocked(isLockedOut).mockResolvedValue(false);
  vi.mocked(recordFailure).mockResolvedValue({ count: 1, locked: false });
  vi.mocked(recordSuccess).mockResolvedValue(undefined);
  mockVerifyPassword.mockResolvedValue(false);
});

function activeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'u1',
    email: 'admin@b.com',
    tokenVersion: 0,
    totpSecret: encryptTotpSecret(SECRET),
    totpEnabledAt: new Date(),
    ...overrides,
  };
}

describe('POST /api/auth/2fa/verify', () => {
  it('missing pending cookie → 400 TOTP_SESSION_EXPIRED', async () => {
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_SESSION_EXPIRED');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('garbage pending cookie → 400 TOTP_SESSION_EXPIRED', async () => {
    const res = await POST(makeReq({ code: '123456' }, 'not-a-jwt'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_SESSION_EXPIRED');
  });

  it('valid pending token but 2FA no longer enabled on the account → TOTP_SESSION_EXPIRED', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser({ totpEnabledAt: null }) as never);
    const res = await POST(makeReq({ code: '123456' }, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_SESSION_EXPIRED');
  });

  it('happy path: correct TOTP code issues session cookies and clears the pending cookie', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);

    const validToken = authenticator.generate(SECRET);
    const res = await POST(makeReq({ code: validToken }, token));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, user: { sub: 'u1', email: 'admin@b.com' } });
    expect(recordSuccess).toHaveBeenCalledWith('admin@b.com');
    expect(__cookieStore.has('app-token')).toBe(true);
    expect(__cookieStore.has('app-refresh')).toBe(true);
    expect(__cookieStore.has('app-csrf')).toBe(true);
    // Pending cookie cleared (value emptied, maxAge 0).
    expect(__cookieStore.get(PENDING_2FA_COOKIE)?.value).toBe('');
  });

  it('wrong code with no matching backup code → 400 TOTP_CODE_INVALID, recordFailure called', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);
    prismaMock.totpBackupCode.findMany.mockResolvedValue([]);

    const res = await POST(makeReq({ code: '000000' }, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_CODE_INVALID');
    expect(recordFailure).toHaveBeenCalledWith('admin@b.com');
    expect(__cookieStore.has('app-token')).toBe(false);
  });

  it('locked-out threshold hit on a wrong code → 423 LOCKED_OUT', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);
    prismaMock.totpBackupCode.findMany.mockResolvedValue([]);
    vi.mocked(recordFailure).mockResolvedValue({ count: 5, locked: true });

    const res = await POST(makeReq({ code: '000000' }, token));
    expect(res.status).toBe(423);
    expect((await res.json()).error).toBe('LOCKED_OUT');
  });

  it('already locked out → 423 before any code comparison', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);
    vi.mocked(isLockedOut).mockResolvedValue(true);

    const res = await POST(makeReq({ code: '000000' }, token));
    expect(res.status).toBe(423);
    expect((await res.json()).error).toBe('LOCKED_OUT');
    expect(prismaMock.totpBackupCode.findMany).not.toHaveBeenCalled();
  });

  it('a valid backup code succeeds and is consumed (single-use, TOCTOU-safe)', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);
    prismaMock.totpBackupCode.findMany.mockResolvedValue([
      { id: 'bc1', codeHash: 'hashed-code' } as never,
    ]);
    mockVerifyPassword.mockResolvedValue(true);
    prismaMock.totpBackupCode.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makeReq({ code: 'AB3D-7XQK' }, token));
    expect(res.status).toBe(200);
    expect(prismaMock.totpBackupCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'bc1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('WR-05-style race: backup code matched but already consumed by a concurrent request → failure', async () => {
    const token = await mintPendingTwoFactorToken('u1');
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);
    prismaMock.totpBackupCode.findMany.mockResolvedValue([
      { id: 'bc1', codeHash: 'hashed-code' } as never,
    ]);
    mockVerifyPassword.mockResolvedValue(true);
    // Another request already consumed it — updateMany's usedAt:null guard finds 0 rows.
    prismaMock.totpBackupCode.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeReq({ code: 'AB3D-7XQK' }, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOTP_CODE_INVALID');
    expect(__cookieStore.has('app-token')).toBe(false);
  });

  it('returns 429 TOO_MANY_2FA_ATTEMPTS after exceeding the per-email limit', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser() as never);
    prismaMock.totpBackupCode.findMany.mockResolvedValue([]);

    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      const token = await mintPendingTwoFactorToken('u1');
      last = await POST(makeReq({ code: '000000' }, token));
    }
    expect(last?.status).toBe(429);
    expect((await last!.json()).error).toBe('TOO_MANY_2FA_ATTEMPTS');
  });
});
