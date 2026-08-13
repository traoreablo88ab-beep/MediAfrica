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
  return new NextRequest('http://test/api/patients/pt-1/nutrition', {
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

describe('POST /api/patients/[id]/nutrition', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(
      makePost({ classification: 'MAM' }, { csrf: 'missing' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ classification: 'MAM' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
  });

  it('current month closed → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ classification: 'MAM' }), ctxWith('pt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition',
          }),
        }),
      }),
    );
  });

  it('invalid classification → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ classification: 'INVALID' }), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('unknown patient → 404 PATIENT_NOT_FOUND; no Nutrition created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ classification: 'MAM' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
  });

  it('happy path: providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.nutrition.create.mockResolvedValue({
      id: 'n-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        providerId: 'someone-else',
        typeCas: 'NC',
        perimetreBrachialCm: 11.2,
        oedemes: 'Non',
        classification: 'MAS avec complication',
        testAppetit: 'Faible/Échec',
        priseEnCharge: 'URENI',
        atpe: true,
        numeroVisiteSuivi: 1,
        evolution: 'En cours',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.nutrition.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.providerId).toBe('user-1');
    expect(createArg.patientId).toBe('pt-1');
    expect(createArg.typeCas).toBe('NC');
    expect(createArg.perimetreBrachialCm).toBe(11.2);
    expect(createArg.oedemes).toBe('Non');
    expect(createArg.classification).toBe('MAS avec complication');
    expect(createArg.testAppetit).toBe('Faible/Échec');
    expect(createArg.priseEnCharge).toBe('URENI');
    expect(createArg.atpe).toBe(true);
    expect(createArg.numeroVisiteSuivi).toBe(1);
    expect(createArg.evolution).toBe('En cours');
  });
});
