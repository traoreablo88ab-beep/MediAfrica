import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { PATCH, DELETE } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: 'PATCH' | 'DELETE', body: unknown = {}): NextRequest {
  return new NextRequest('http://test/api/nutritions/n-1', {
    method,
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
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
});

describe('PATCH /api/nutritions/[id]', () => {
  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makeReq('PATCH', { typeSortie: 'Guéri' }), ctxWith('n-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.nutrition.update).not.toHaveBeenCalled();
  });

  it('invalid typeSortie → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makeReq('PATCH', { typeSortie: 'INVALID' }), ctxWith('n-1'));
    expect(res.status).toBe(400);
  });

  it('unknown nutrition record → 404 NUTRITION_NOT_FOUND', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq('PATCH', { typeSortie: 'Guéri' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutrition.update).not.toHaveBeenCalled();
  });

  it('admission month closed → 409 REGISTER_CLOSED, checked against the record type + its own date', async () => {
    const admission = new Date('2025-12-20T09:00:00Z');
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAS',
      date: admission,
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);

    const res = await PATCH(makeReq('PATCH', { typeSortie: 'Guéri' }), ctxWith('n-1'));
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
    expect(prismaMock.nutrition.update).not.toHaveBeenCalled();
  });

  it('happy path (URENI): records sortie anthropometry + type de sortie + séances', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENI',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutrition.update.mockResolvedValue({
      id: 'n-1',
      dateSortie: new Date('2026-01-18T10:00:00Z'),
      typeSortie: 'Guéri',
    } as never);

    const res = await PATCH(
      makeReq('PATCH', {
        dateSortie: '2026-01-18T10:00:00Z',
        poidsSortieKg: 7.2,
        typeSortie: 'Guéri',
        datePoidsMinimum: '2026-01-13T00:00:00Z',
        poidsMinimumKg: 6.1,
        seancesStimulationPsychocognitive: 3,
        seancesCcsc: 2,
      }),
      ctxWith('n-1'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.nutrition.update.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(updateArg.typeSortie).toBe('Guéri');
    expect(updateArg.dateSortie).toBeInstanceOf(Date);
    expect(updateArg.poidsSortieKg).toBe(7.2);
    expect(updateArg.poidsMinimumKg).toBe(6.1);
    expect(updateArg.seancesStimulationPsychocognitive).toBe(3);
    expect(updateArg.seancesCcsc).toBe(2);
  });

  it('happy path (URENAM): records final outcome fields, including dateSortie', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-2',
      type: 'URENAM',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutrition.update.mockResolvedValue({
      id: 'n-2',
      dateSortie: new Date('2026-03-08T10:00:00Z'),
      typeSortie: 'Guéri',
    } as never);

    const res = await PATCH(
      makeReq('PATCH', {
        dateSortie: '2026-03-08T10:00:00Z',
        typeSortie: 'Guéri',
        beneficiairePoudreNutritive: true,
        beneficiairePlaquette: false,
        dureeSejourJours: 56,
      }),
      ctxWith('n-2'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.nutrition.update.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(updateArg.typeSortie).toBe('Guéri');
    expect(updateArg.dateSortie).toBeInstanceOf(Date);
    expect(updateArg.beneficiairePoudreNutritive).toBe(true);
    expect(updateArg.beneficiairePlaquette).toBe(false);
    expect(updateArg.dureeSejourJours).toBe(56);
  });

  it('happy path (URENAS): records destinationProgramme when transferred/referred', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-3',
      type: 'URENAS',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.nutrition.update.mockResolvedValue({
      id: 'n-3',
      dateSortie: new Date('2026-01-25T10:00:00Z'),
      typeSortie: 'Transféré/référé',
    } as never);

    const res = await PATCH(
      makeReq('PATCH', {
        dateSortie: '2026-01-25T10:00:00Z',
        typeSortie: 'Transféré/référé',
        destinationProgramme: 'URENI',
      }),
      ctxWith('n-3'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.nutrition.update.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(updateArg.typeSortie).toBe('Transféré/référé');
    expect(updateArg.destinationProgramme).toBe('URENI');
  });
});

describe('DELETE /api/nutritions/[id]', () => {
  it('unknown nutrition record → 404 NUTRITION_NOT_FOUND', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE'), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutrition.delete).not.toHaveBeenCalled();
  });

  it('register month closed → 409 REGISTER_CLOSED; no delete', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENAM',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await DELETE(makeReq('DELETE'), ctxWith('n-1'));
    expect(res.status).toBe(409);
    expect(prismaMock.nutrition.delete).not.toHaveBeenCalled();
  });

  it('happy path: deletes and returns ok', async () => {
    prismaMock.nutrition.findFirst.mockResolvedValue({
      id: 'n-1',
      type: 'URENI',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);
    const res = await DELETE(makeReq('DELETE'), ctxWith('n-1'));
    expect(res.status).toBe(200);
    expect(prismaMock.nutrition.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
  });
});
