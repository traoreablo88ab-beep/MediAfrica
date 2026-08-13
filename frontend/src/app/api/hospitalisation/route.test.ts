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

function hospitalisationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'h-1',
    patientId: 'pt-1',
    providerId: 'user-1',
    dateHeureEntree: new Date('2026-01-12T07:45:00Z'),
    motifAdmission: 'Paludisme grave',
    service: 'Maternité',
    numeroHospitalisation: null,
    referenceOrigine: null,
    profession: null,
    indigent: null,
    telephoneContact: null,
    localisationPrecise: null,
    diagnosticPrincipal: 'Paludisme sévère',
    diagnosticsSecondaires: null,
    traitementRecu: 'Artésunate IV',
    dateHeureSortie: null,
    issue: null,
    causeDeces: null,
    structureReference: null,
    praticienResponsable: 'Dr. Traoré',
    observations: null,
    createdAt: new Date('2026-01-12T07:45:00Z'),
    updatedAt: new Date('2026-01-12T07:45:00Z'),
    patient: {
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: new Date('2020-03-12T00:00:00Z'),
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

describe('GET /api/hospitalisation', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/hospitalisation?service=Maternité'));
    expect(res.status).toBe(401);
  });

  it('missing service → no filter, returns every service (single register)', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/hospitalisation'));
    expect(res.status).toBe(200);
    const args = prismaMock.hospitalisation.findMany.mock.calls[0]?.[0];
    expect(args?.where?.service).toBeUndefined();
  });

  it('invalid service value → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/hospitalisation?service=INVALID'));
    expect(res.status).toBe(400);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/hospitalisation?service=Maternité'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows with patient + providerName, dateHeureSortie null when still admitted', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([hospitalisationRow()] as never);
    const res = await GET(makeGet('http://test/api/hospitalisation?service=Maternité'));
    const body = await res.json();
    expect(body.items[0].patient).toEqual({
      id: 'pt-1',
      nom: 'Keïta',
      prenom: 'Fatoumata',
      dossierNumber: 'P-20260001',
      dateNaissance: '2020-03-12T00:00:00.000Z',
      sexe: 'F',
      communeResidence: 'Commune V, Bamako',
    });
    expect(body.items[0].providerName).toBe('Amadou Diallo');
    expect(body.items[0].motifAdmission).toBe('Paludisme grave');
    expect(body.items[0].dateHeureSortie).toBeNull();
  });

  it('serializes indigent/telephoneContact/localisationPrecise', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([
      hospitalisationRow({
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
      }),
    ] as never);
    const res = await GET(makeGet('http://test/api/hospitalisation?service=Maternité'));
    const body = await res.json();
    expect(body.items[0].indigent).toBe(true);
    expect(body.items[0].telephoneContact).toBe('76 00 00 00');
    expect(body.items[0].localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
  });

  it('includes discharge fields once discharged', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([
      hospitalisationRow({
        dateHeureSortie: new Date('2026-01-18T10:00:00Z'),
        issue: 'Sortie médicale',
      }),
    ] as never);
    const res = await GET(makeGet('http://test/api/hospitalisation?service=Maternité'));
    const body = await res.json();
    expect(body.items[0].dateHeureSortie).toBe('2026-01-18T10:00:00.000Z');
    expect(body.items[0].issue).toBe('Sortie médicale');
  });

  it('?service= filters the query by service', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/hospitalisation?service=Urgences'));
    const args = prismaMock.hospitalisation.findMany.mock.calls[0]?.[0];
    expect(args?.where?.service).toEqual({ in: ['Urgences'] });
  });

  it('?service=Médecine,Chirurgie filters by both services (combined register)', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/hospitalisation?service=Médecine,Chirurgie'));
    const args = prismaMock.hospitalisation.findMany.mock.calls[0]?.[0];
    expect(args?.where?.service).toEqual({ in: ['Médecine', 'Chirurgie'] });
  });

  it('defaults the date filter (dateHeureEntree) to the start of today', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/hospitalisation?service=Maternité'));
    const args = prismaMock.hospitalisation.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.dateHeureEntree as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-12T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('?dateFrom=&dateTo= filters a range', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    await GET(
      makeGet(
        'http://test/api/hospitalisation?service=Maternité&dateFrom=2026-01-01&dateTo=2026-01-31',
      ),
    );
    const args = prismaMock.hospitalisation.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.dateHeureEntree as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-02-01T00:00:00'));
  });

  it('?q= searches the related patient nom/prenom/dossierNumber (insensitive)', async () => {
    prismaMock.hospitalisation.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/hospitalisation?service=Maternité&q=Traor%C3%A9'));
    const args = prismaMock.hospitalisation.findMany.mock.calls[0]?.[0];
    const patientFilter = args?.where?.patient as { OR?: Array<Record<string, unknown>> };
    expect(patientFilter.OR).toHaveLength(3);
    expect(patientFilter.OR?.[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });
});
