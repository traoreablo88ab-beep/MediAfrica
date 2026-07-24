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

function consultationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c-1',
    patientId: 'pt-1',
    providerId: 'user-1',
    date: new Date('2026-01-12T07:45:00Z'),
    motif: 'Paludisme simple',
    status: 'traite',
    diagnostic: null,
    traitementPrescrit: null,
    tensionArterielle: null,
    poidsKg: null,
    tailleCm: null,
    perimetreBrachialCm: null,
    statutPT: null,
    temperatureC: null,
    typeCas: null,
    mdo: false,
    mdoMaladie: null,
    tdr: null,
    ge: null,
    createdAt: new Date('2026-01-12T07:45:00Z'),
    updatedAt: new Date('2026-01-12T07:45:00Z'),
    patient: {
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: new Date('1990-03-12T00:00:00Z'),
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

describe('GET /api/consultations', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/consultations'));
    expect(res.status).toBe(401);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/consultations'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows with patient + providerName', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([consultationRow()] as never);
    const res = await GET(makeGet('http://test/api/consultations'));
    const body = await res.json();
    expect(body.items[0].patient).toEqual({
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: '1990-03-12T00:00:00.000Z',
      sexe: 'F',
      communeResidence: 'Commune V, Bamako',
    });
    expect(body.items[0].providerName).toBe('Amadou Diallo');
    expect(body.items[0].date).toBe('2026-01-12T07:45:00.000Z');
  });

  it('serializes tdr/ge lab test fields', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      consultationRow({ tdr: 'Positif', ge: 'Négatif' }),
    ] as never);
    const res = await GET(makeGet('http://test/api/consultations'));
    const body = await res.json();
    expect(body.items[0].tdr).toBe('Positif');
    expect(body.items[0].ge).toBe('Négatif');
  });

  it('providerName is null when the consultation has no provider', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      consultationRow({ provider: null }),
    ] as never);
    const res = await GET(makeGet('http://test/api/consultations'));
    const body = await res.json();
    expect(body.items[0].providerName).toBeNull();
  });

  it('defaults the date filter to the start of today', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/consultations'));
    const args = prismaMock.consultation.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-12T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('?date=2026-01-05 filters that specific day', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/consultations?date=2026-01-05'));
    const args = prismaMock.consultation.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-05T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-06T00:00:00'));
  });

  it('?dateFrom=&dateTo= filters a range and takes precedence over ?date=', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([] as never);
    await GET(
      makeGet(
        'http://test/api/consultations?date=2026-01-05&dateFrom=2026-01-01&dateTo=2026-01-31',
      ),
    );
    const args = prismaMock.consultation.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-02-01T00:00:00'));
  });

  it('?status= filters directly on Consultation.status', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/consultations?status=urgent'));
    const args = prismaMock.consultation.findMany.mock.calls[0]?.[0];
    expect(args?.where?.status).toBe('urgent');
  });

  it('?q= searches the related patient nom/prenom/dossierNumber (insensitive)', async () => {
    prismaMock.consultation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/consultations?q=Traor%C3%A9'));
    const args = prismaMock.consultation.findMany.mock.calls[0]?.[0];
    const patientFilter = args?.where?.patient as { OR?: Array<Record<string, unknown>> };
    expect(patientFilter.OR).toHaveLength(3);
    expect(patientFilter.OR?.[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });
});
