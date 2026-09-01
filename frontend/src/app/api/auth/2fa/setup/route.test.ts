import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makePost(): NextRequest {
  return new NextRequest('http://test/api/auth/2fa/setup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
});

describe('POST /api/auth/2fa/setup', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const req = new NextRequest('http://test/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 403 when requireAdmin bails (non-admin caller)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('generates a secret, stores it encrypted, and returns QR + manual-entry data', async () => {
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.secret).toBe('string');
    expect(body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.user.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'admin-1' });
    // Stored secret must not be the plaintext secret returned to the client.
    expect(updateArg?.data?.totpSecret).not.toBe(body.secret);
    expect(updateArg?.data).not.toHaveProperty('totpEnabledAt');
  });

  it('returns 503 ENCRYPTION_NOT_CONFIGURED when ENCRYPTION_KEY is unset', async () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      const res = await POST(makePost());
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('ENCRYPTION_NOT_CONFIGURED');
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.ENCRYPTION_KEY = original;
    }
  });
});
