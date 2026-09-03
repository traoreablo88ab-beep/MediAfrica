import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const runGuichetAlertesCheckMock = vi.fn();
vi.mock('@/lib/server/guichet/alertes', () => ({
  runGuichetAlertesCheck: runGuichetAlertesCheckMock,
}));

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  runGuichetAlertesCheckMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/guichet-alertes', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/guichet-alertes', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runGuichetAlertesCheckMock).not.toHaveBeenCalled();
  });

  it('calls runGuichetAlertesCheck with prisma', async () => {
    runGuichetAlertesCheckMock.mockResolvedValueOnce({ organizationsChecked: 0, alertsFired: 0 });
    const { POST } = await import('./route');
    await POST(makeReq());
    expect(runGuichetAlertesCheckMock).toHaveBeenCalled();
    const arg = runGuichetAlertesCheckMock.mock.calls[0]![0] as { prisma: unknown };
    expect(arg.prisma).toBeDefined();
  });

  it('returns counts from the helper', async () => {
    runGuichetAlertesCheckMock.mockResolvedValueOnce({ organizationsChecked: 4, alertsFired: 2 });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, organizationsChecked: 4, alertsFired: 2 });
  });
});
