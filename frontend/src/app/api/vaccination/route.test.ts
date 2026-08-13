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

function vaccinationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'v-1',
    patientId: 'pt-1',
    providerId: 'user-1',
    date: new Date('2026-01-12T07:45:00Z'),
    antigene: 'BCG',
    numeroDose: null,
    voieAdministration: 'Intradermique',
    siteInjection: 'Bras droit',
    numeroLot: 'LOT-2026-01',
    effetsSecondaires: null,
    prochainRdv: null,
    observations: null,
    createdAt: new Date('2026-01-12T07:45:00Z'),
    updatedAt: new Date('2026-01-12T07:45:00Z'),
    patient: {
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: new Date('2026-01-01T00:00:00Z'),
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

describe('GET /api/vaccination', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/vaccination'));
    expect(res.status).toBe(401);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/vaccination'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows with patient + providerName', async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([vaccinationRow()] as never);
    const res = await GET(makeGet('http://test/api/vaccination'));
    const body = await res.json();
    expect(body.items[0].patient).toEqual({
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: '2026-01-01T00:00:00.000Z',
      sexe: 'F',
      communeResidence: 'Commune V, Bamako',
    });
    expect(body.items[0].providerName).toBe('Amadou Diallo');
    expect(body.items[0].antigene).toBe('BCG');
  });

  it('providerName is null when the record has no provider', async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([
      vaccinationRow({ provider: null }),
    ] as never);
    const res = await GET(makeGet('http://test/api/vaccination'));
    const body = await res.json();
    expect(body.items[0].providerName).toBeNull();
  });

  it('defaults the date filter to the start of today', async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/vaccination'));
    const args = prismaMock.vaccination.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-12T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('?dateFrom=&dateTo= filters a range', async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/vaccination?dateFrom=2026-01-01&dateTo=2026-01-31'));
    const args = prismaMock.vaccination.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-02-01T00:00:00'));
  });

  it('?q= searches the related patient nom/prenom/dossierNumber (insensitive)', async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/vaccination?q=Traor%C3%A9'));
    const args = prismaMock.vaccination.findMany.mock.calls[0]?.[0];
    const patientFilter = args?.where?.patient as { OR?: Array<Record<string, unknown>> };
    expect(patientFilter.OR).toHaveLength(3);
    expect(patientFilter.OR?.[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });
});
