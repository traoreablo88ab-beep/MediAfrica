import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/nutritions/n-1/visites', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/nutritions/[id]/visites', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({}, { csrf: 'missing' }), ctxWith('n-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.nutritionVisiteSuivi.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({}), ctxWith('n-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.nutritionVisiteSuivi.create).not.toHaveBeenCalled();
  });

  it('unknown nutrition record → 404 NUTRITION_NOT_FOUND', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({}), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutritionVisiteSuivi.create).not.toHaveBeenCalled();
  });

  it('URENI record → visite accepted, closure checked against nutrition-ureni', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENI',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutritionVisiteSuivi.findFirst.mockResolvedValue(null);
    prismaMock.nutritionVisiteSuivi.create.mockResolvedValue({
      id: 'v-1',
      nutritionId: 'n-1',
      numeroVisite: 1,
      date: new Date('2026-01-13T09:00:00Z'),
    } as never);

    const res = await POST(makePost({ poidsKg: 6.4, testAppetit: 'Bon' }), ctxWith('n-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition-ureni',
          }),
        }),
      }),
    );
    const createArg = prismaMock.nutritionVisiteSuivi.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.testAppetit).toBe('Bon');
  });

  it('URENAS record → visite accepted, closure checked against nutrition-urenas', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAS',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutritionVisiteSuivi.findFirst.mockResolvedValue(null);
    prismaMock.nutritionVisiteSuivi.create.mockResolvedValue({
      id: 'v-1',
      nutritionId: 'n-1',
      numeroVisite: 1,
      date: new Date('2026-01-19T09:00:00Z'),
    } as never);

    const res = await POST(makePost({}), ctxWith('n-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition-urenas',
          }),
        }),
      }),
    );
  });

  it('register month closed → 409 REGISTER_CLOSED, checked against the episode date', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAM',
      date: new Date('2025-12-20T09:00:00Z'),
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({}), ctxWith('n-1'));
    expect(res.status).toBe(409);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition-urenam',
            month: '2025-12',
          }),
        }),
      }),
    );
    expect(prismaMock.nutritionVisiteSuivi.create).not.toHaveBeenCalled();
  });

  it('first visite → numeroVisite defaults to 1 when no prior visite exists', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAM',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutritionVisiteSuivi.findFirst.mockResolvedValue(null);
    prismaMock.nutritionVisiteSuivi.create.mockResolvedValue({
      id: 'v-1',
      nutritionId: 'n-1',
      numeroVisite: 1,
      date: new Date('2026-01-19T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({ poidsKg: 8.2, perimetreBrachialCm: 11.6, oedemes: 'Non' }),
      ctxWith('n-1'),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.nutritionVisiteSuivi.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.numeroVisite).toBe(1);
    expect(createArg.poidsKg).toBe(8.2);
    expect(createArg.perimetreBrachialCm).toBe(11.6);
    expect(createArg.oedemes).toBe('Non');
  });

  it('subsequent visite → numeroVisite increments from the last one', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAM',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutritionVisiteSuivi.findFirst.mockResolvedValue({
      id: 'v-2',
      numeroVisite: 2,
    } as never);
    prismaMock.nutritionVisiteSuivi.create.mockResolvedValue({
      id: 'v-3',
      nutritionId: 'n-1',
      numeroVisite: 3,
      date: new Date('2026-02-02T09:00:00Z'),
    } as never);

    await POST(makePost({}), ctxWith('n-1'));
    const createArg = prismaMock.nutritionVisiteSuivi.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.numeroVisite).toBe(3);
  });
});
