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
    type: 'URENI',
    numeroMas: 'MAS-2026-0042',
    telephoneContact: null,
    localisationPrecise: null,
    ageMois: 18,
    modeAdmission: 'TN/REF',
    typeCas: null,
    poidsKg: 6.4,
    tailleCm: 68,
    perimetreBrachialCm: 10.8,
    ptIndice: '-3 ET',
    oedemes: '++',
    pathologiesAssociees: null,
    dateSortie: null,
    poidsSortieKg: null,
    tailleSortieCm: null,
    perimetreBrachialSortieCm: null,
    ptIndiceSortie: null,
    oedemeSortie: null,
    typeSortie: null,
    destinationProgramme: null,
    datePoidsMinimum: null,
    poidsMinimumKg: null,
    seancesStimulationPsychocognitive: null,
    seancesCcsc: null,
    beneficiairePoudreNutritive: null,
    beneficiairePlaquette: null,
    dureeSejourJours: null,
    observations: null,
    nomPere: null,
    nomMere: null,
    allaite: null,
    jumeaux: null,
    parentsVivants: null,
    sourceAdmission: null,
    provenanceProgramme: null,
    carteVaccination: null,
    vaccinationAJour: null,
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
    visites: [],
    evenements: [],
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
    const res = await GET(makeGet('http://test/api/nutrition?type=URENI'));
    expect(res.status).toBe(401);
  });

  it('missing type query param → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/nutrition'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.nutrition.findMany).not.toHaveBeenCalled();
  });

  it('invalid type query param → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/nutrition?type=INVALID'));
    expect(res.status).toBe(400);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/nutrition?type=URENI'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows with patient + providerName', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([nutritionRow()] as never);
    const res = await GET(makeGet('http://test/api/nutrition?type=URENI'));
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
    expect(body.items[0].type).toBe('URENI');
    expect(body.items[0].numeroMas).toBe('MAS-2026-0042');
    expect(body.items[0].modeAdmission).toBe('TN/REF');
  });

  it('serializes nested visites for URENAM rows, ordered by numeroVisite', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([
      nutritionRow({
        type: 'URENAM',
        visites: [
          { id: 'v-1', numeroVisite: 1, date: new Date('2026-01-19T09:00:00Z'), poidsKg: 8.2 },
          { id: 'v-2', numeroVisite: 2, date: new Date('2026-02-02T09:00:00Z'), poidsKg: 8.6 },
        ],
      }),
    ] as never);
    const res = await GET(makeGet('http://test/api/nutrition?type=URENAM'));
    const body = await res.json();
    expect(body.items[0].visites).toHaveLength(2);
    expect(body.items[0].visites[0].numeroVisite).toBe(1);
    expect(body.items[0].visites[1].poidsKg).toBe(8.6);
  });

  it('serializes nested evenements for URENAS rows, ordered by date', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([
      nutritionRow({
        type: 'URENAS',
        evenements: [
          {
            id: 'e-1',
            type: 'VAD',
            date: new Date('2026-01-19T09:00:00Z'),
            raison: 'Non retour',
            conclusion: 'Retour prévu',
            centre: null,
            resultat: null,
          },
          {
            id: 'e-2',
            type: 'REFERENCE_TRANSFERT',
            date: new Date('2026-01-26T09:00:00Z'),
            raison: 'Complications',
            conclusion: null,
            centre: 'CSCom Ansongo',
            resultat: 'Retour confirmé',
          },
        ],
      }),
    ] as never);
    const res = await GET(makeGet('http://test/api/nutrition?type=URENAS'));
    const body = await res.json();
    expect(body.items[0].evenements).toHaveLength(2);
    expect(body.items[0].evenements[0]).toEqual({
      id: 'e-1',
      type: 'VAD',
      date: '2026-01-19T09:00:00.000Z',
      raison: 'Non retour',
      conclusion: 'Retour prévu',
      centre: null,
      resultat: null,
    });
    expect(body.items[0].evenements[1].centre).toBe('CSCom Ansongo');
  });

  it('?summary=1 omits visites/evenements from the response and skips their include', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([nutritionRow()] as never);
    const res = await GET(makeGet('http://test/api/nutrition?type=URENI&summary=1'));
    const body = await res.json();
    expect(body.items[0].visites).toBeUndefined();
    expect(body.items[0].evenements).toBeUndefined();
    expect(body.items[0].provenanceProgramme).toBeNull();
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const include = args?.include as { visites?: unknown; evenements?: unknown };
    expect(include?.visites).toBeUndefined();
    expect(include?.evenements).toBeUndefined();
  });

  it('providerName is null when the record has no provider', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([nutritionRow({ provider: null })] as never);
    const res = await GET(makeGet('http://test/api/nutrition?type=URENI'));
    const body = await res.json();
    expect(body.items[0].providerName).toBeNull();
  });

  it('?type= is passed through to the Prisma where clause', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/nutrition?type=URENAS'));
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    expect(args?.where?.type).toBe('URENAS');
  });

  it('defaults the date filter to the start of today', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/nutrition?type=URENI'));
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-12T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('?dateFrom=&dateTo= filters a range', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(
      makeGet('http://test/api/nutrition?type=URENI&dateFrom=2026-01-01&dateTo=2026-01-31'),
    );
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-02-01T00:00:00'));
  });

  it('?q= searches the related patient nom/prenom/dossierNumber (insensitive)', async () => {
    prismaMock.nutrition.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/nutrition?type=URENI&q=Traor%C3%A9'));
    const args = prismaMock.nutrition.findMany.mock.calls[0]?.[0];
    const patientFilter = args?.where?.patient as { OR?: Array<Record<string, unknown>> };
    expect(patientFilter.OR).toHaveLength(3);
    expect(patientFilter.OR?.[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });
});
