import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { DELETE } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function ctxWith(
  id: string,
  evenementId: string,
): { params: Promise<{ id: string; evenementId: string }> } {
  return { params: Promise.resolve({ id, evenementId }) };
}

function makeDelete(): NextRequest {
  return new NextRequest('http://test/api/nutritions/n-1/evenements/e-1', {
    method: 'DELETE',
    headers: { 'x-csrf-token': 'csrf-tok', cookie: 'app-csrf=csrf-tok' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
});

describe('DELETE /api/nutritions/[id]/evenements/[evenementId]', () => {
  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await DELETE(makeDelete(), ctxWith('n-1', 'e-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.nutritionEvenement.delete).not.toHaveBeenCalled();
  });

  it('unknown evenement → 404 EVENEMENT_NOT_FOUND', async () => {
    prismaMock.nutritionEvenement.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeDelete(), ctxWith('n-1', 'missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutritionEvenement.delete).not.toHaveBeenCalled();
  });

  it('register month closed → 409 REGISTER_CLOSED, checked against the parent episode date', async () => {
    prismaMock.nutritionEvenement.findFirst.mockResolvedValue({
      id: 'e-1',
      nutritionId: 'n-1',
      nutrition: { date: new Date('2025-12-20T09:00:00Z'), type: 'URENAS' },
    } as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await DELETE(makeDelete(), ctxWith('n-1', 'e-1'));
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
    expect(prismaMock.nutritionEvenement.delete).not.toHaveBeenCalled();
  });

  it('happy path: deletes and returns ok', async () => {
    prismaMock.nutritionEvenement.findFirst.mockResolvedValue({
      id: 'e-1',
      nutritionId: 'n-1',
      nutrition: { date: new Date('2026-01-12T09:00:00Z'), type: 'URENAS' },
    } as never);
    const res = await DELETE(makeDelete(), ctxWith('n-1', 'e-1'));
    expect(res.status).toBe(200);
    expect(prismaMock.nutritionEvenement.delete).toHaveBeenCalledWith({
      where: { id: 'e-1' },
    });
  });
});
