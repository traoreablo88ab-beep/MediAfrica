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
  return new NextRequest('http://test/api/hospitalisations/h-1', {
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

describe('PATCH /api/hospitalisations/[id]', () => {
  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makeReq('PATCH', { issue: 'Sortie médicale' }), ctxWith('h-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.hospitalisation.update).not.toHaveBeenCalled();
  });

  it('invalid issue → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makeReq('PATCH', { issue: 'INVALID' }), ctxWith('h-1'));
    expect(res.status).toBe(400);
  });

  it('unknown hospitalisation → 404 HOSPITALISATION_NOT_FOUND', async () => {
    prismaMock.hospitalisation.findFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq('PATCH', { issue: 'Sortie médicale' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.hospitalisation.update).not.toHaveBeenCalled();
  });

  it('admission month closed → 409 REGISTER_CLOSED, checked against dateHeureEntree', async () => {
    const entree = new Date('2025-12-20T09:00:00Z');
    prismaMock.hospitalisation.findFirst.mockResolvedValue({
      id: 'h-1',
      dateHeureEntree: entree,
      service: 'Urgences',
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);

    const res = await PATCH(makeReq('PATCH', { issue: 'Sortie médicale' }), ctxWith('h-1'));
    expect(res.status).toBe(409);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'hospitalisation',
            month: '2025-12',
          }),
        }),
      }),
    );
    expect(prismaMock.hospitalisation.update).not.toHaveBeenCalled();
  });

  it('happy path: records discharge date + issue', async () => {
    prismaMock.hospitalisation.findFirst.mockResolvedValue({
      id: 'h-1',
      dateHeureEntree: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.hospitalisation.update.mockResolvedValue({
      id: 'h-1',
      dateHeureSortie: new Date('2026-01-18T10:00:00Z'),
      issue: 'Sortie médicale',
    } as never);

    const res = await PATCH(
      makeReq('PATCH', { dateHeureSortie: '2026-01-18T10:00:00Z', issue: 'Sortie médicale' }),
      ctxWith('h-1'),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.hospitalisation.update.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(updateArg.issue).toBe('Sortie médicale');
    expect(updateArg.dateHeureSortie).toBeInstanceOf(Date);
  });
});

describe('DELETE /api/hospitalisations/[id]', () => {
  it('unknown hospitalisation → 404 HOSPITALISATION_NOT_FOUND', async () => {
    prismaMock.hospitalisation.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE'), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.hospitalisation.delete).not.toHaveBeenCalled();
  });

  it('admission month closed → 409 REGISTER_CLOSED; no delete', async () => {
    prismaMock.hospitalisation.findFirst.mockResolvedValue({
      id: 'h-1',
      dateHeureEntree: new Date('2026-01-12T09:00:00Z'),
      service: 'Néonatologie',
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await DELETE(makeReq('DELETE'), ctxWith('h-1'));
    expect(res.status).toBe(409);
    expect(prismaMock.hospitalisation.delete).not.toHaveBeenCalled();
  });

  it('happy path: deletes and returns ok', async () => {
    prismaMock.hospitalisation.findFirst.mockResolvedValue({
      id: 'h-1',
      dateHeureEntree: new Date('2026-01-12T09:00:00Z'),
    } as never);
    const res = await DELETE(makeReq('DELETE'), ctxWith('h-1'));
    expect(res.status).toBe(200);
    expect(prismaMock.hospitalisation.delete).toHaveBeenCalledWith({ where: { id: 'h-1' } });
  });
});
