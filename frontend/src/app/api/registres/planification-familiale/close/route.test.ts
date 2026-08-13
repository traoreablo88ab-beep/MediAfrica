import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/registres/planification-familiale/close', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/registres/planification-familiale/close', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({}, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.registerClosure.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({}));
    expect(res.status).toBe(401);
    expect(prismaMock.registerClosure.create).not.toHaveBeenCalled();
  });

  it('invalid month format → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ month: '2026/01' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('defaults to the current month when no month is given', async () => {
    prismaMock.registerClosure.create.mockResolvedValue({
      month: '2026-01',
      closedAt: new Date('2026-01-12T09:00:00Z'),
    } as never);
    await POST(makePost({}));
    const createArg = prismaMock.registerClosure.create.mock.calls[0]?.[0];
    expect(createArg?.data?.month).toBe('2026-01');
    expect(createArg?.data?.closedById).toBe('user-1');
    expect(createArg?.data?.registerType).toBe('planification-familiale');
    expect(createArg?.data?.organizationId).toBe('org-1');
  });

  it('already closed → 409 ALREADY_CLOSED; no create', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ month: '2026-01' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_CLOSED');
    expect(prismaMock.registerClosure.create).not.toHaveBeenCalled();
  });

  it('happy path: creates the closure, returns 201', async () => {
    prismaMock.registerClosure.create.mockResolvedValue({
      month: '2025-12',
      closedAt: new Date('2026-01-12T09:00:00Z'),
    } as never);
    const res = await POST(makePost({ month: '2025-12' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.month).toBe('2025-12');
  });
});
