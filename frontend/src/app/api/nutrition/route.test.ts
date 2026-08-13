import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function nutritionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n-1',
    patientId: 'pt-1',
    providerId: 'user-1',
    date: new Date('2026-01-12T07:45:00Z'),
    typeCas: 'NC',
    poidsKg: 9.5,
    tailleCm: 72,
    perimetreBrachialCm: 11.2,
    oedemes: 'Non',
    statutPT: null,
    classification: 'MAM',
    testAppetit: 'Bon',
    complicationsMedicales: null,
    priseEnCharge: 'URENAM',
    atpe: true,
    laitF75: null,
    laitF100: null,
    amoxicilline: null,
    vitamineA: null,
    deparasitant: null,
    traitementAutre: null,
    numeroVisiteSuivi: 1,
    evolution: 'En cours',
    prochainRdv: null,
    observations: null,
    createdAt: new Date('2026-01-12T07:45:00Z'),
    updatedAt: new Date('2026-01-12T07:45:00Z'),
    patient: {
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: new Date('2024-03-12T00:00:00Z'),
      sexe: 'F',
      communeResidence: 'Commune V, Bamako',
    },
    provider: { name: 'Amadou Diallo' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/nutrition', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/nutrition'));
    expect(res.status).toBe(401);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/nutrition'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows with patient + providerName', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([nutritionRow()] as never);
    const res = await GET(makeGet('http://test/api/nutrition'));
    const body = await res.json();
    expect(body.items[0].patient).toEqual({
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: '2024-03-12T00:00:00.000Z',
      sexe: 'F',
      communeResidence: 'Commune V, Bamako',
    });
    expect(body.items[0].providerName).toBe('Amadou Diallo');
    expect(body.items[0].classification).toBe('MAM');
  });

  it('providerName is null when the record has no provider', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([nutritionRow({ provider: null })] as never);
    const res = await GET(makeGet('http://test/api/nutrition'));
    const body = await res.json();
    expect(body.items[0].providerName).toBeNull();
  });

  it('defaults the date filter to the start of today', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/nutrition'));
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-12T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('?dateFrom=&dateTo= filters a range', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/nutrition?dateFrom=2026-01-01&dateTo=2026-01-31'));
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-02-01T00:00:00'));
  });

  it('?q= searches the related patient nom/prenom/dossierNumber (insensitive)', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/nutrition?q=Traor%C3%A9'));
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const patientFilter = args?.where?.patient as { OR?: Array<Record<string, unknown>> };
    expect(patientFilter.OR).toHaveLength(3);
    expect(patientFilter.OR?.[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });
});
