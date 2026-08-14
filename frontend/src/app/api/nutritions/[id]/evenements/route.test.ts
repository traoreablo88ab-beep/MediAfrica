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
  return new NextRequest('http://test/api/nutritions/n-1/evenements', {
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
});

describe('POST /api/nutritions/[id]/evenements', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ type: 'VAD' }, { csrf: 'missing' }), ctxWith('n-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.nutritionEvenement.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ type: 'VAD' }), ctxWith('n-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.nutritionEvenement.create).not.toHaveBeenCalled();
  });

  it('invalid body (missing type) → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}), ctxWith('n-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.nutritionEvenement.create).not.toHaveBeenCalled();
  });

  it('unknown nutrition record → 404 NUTRITION_NOT_FOUND', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ type: 'VAD' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutritionEvenement.create).not.toHaveBeenCalled();
  });

  it('type !== URENAS → 400 INVALID_NUTRITION_TYPE', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENI',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    const res = await POST(makePost({ type: 'VAD' }), ctxWith('n-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_NUTRITION_TYPE');
    expect(prismaMock.nutritionEvenement.create).not.toHaveBeenCalled();
  });

  it('register month closed → 409 REGISTER_CLOSED, checked against nutrition-urenas', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAS',
      date: new Date('2025-12-20T09:00:00Z'),
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ type: 'VAD' }), ctxWith('n-1'));
    expect(res.status).toBe(409);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition-urenas',
            month: '2025-12',
          }),
        }),
      }),
    );
    expect(prismaMock.nutritionEvenement.create).not.toHaveBeenCalled();
  });

  it('happy path: VAD entry created', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAS',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutritionEvenement.create.mockResolvedValue({
      id: 'e-1',
      nutritionId: 'n-1',
      type: 'VAD',
      date: new Date('2026-01-19T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        type: 'VAD',
        raison: 'Non retour',
        conclusion: 'Retour prévu la semaine prochaine',
      }),
      ctxWith('n-1'),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.nutritionEvenement.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.type).toBe('VAD');
    expect(createArg.raison).toBe('Non retour');
    expect(createArg.conclusion).toBe('Retour prévu la semaine prochaine');
  });

  it('happy path: reference/transfert entry created with centre + resultat', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAS',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutritionEvenement.create.mockResolvedValue({
      id: 'e-2',
      nutritionId: 'n-1',
      type: 'REFERENCE_TRANSFERT',
      date: new Date('2026-01-19T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        type: 'REFERENCE_TRANSFERT',
        raison: 'Complications',
        centre: 'CSCom Ansongo',
        resultat: 'Retour confirmé',
      }),
      ctxWith('n-1'),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.nutritionEvenement.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.type).toBe('REFERENCE_TRANSFERT');
    expect(createArg.centre).toBe('CSCom Ansongo');
    expect(createArg.resultat).toBe('Retour confirmé');
  });
});
