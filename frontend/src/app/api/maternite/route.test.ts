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

function materniteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm-1',
    patientId: 'pt-1',
    providerId: 'user-1',
    date: new Date('2026-01-12T07:45:00Z'),
    type: 'CPN',
    gestite: null,
    parite: null,
    dpa: null,
    ddr: null,
    observations: null,
    indigent: null,
    telephoneContact: null,
    localisationPrecise: null,
    cpnNumeroVisite: null,
    ageGestationnelSemaines: null,
    poidsKg: null,
    tensionArterielle: null,
    hauteurUterineCm: null,
    bruitsCoeurFoetal: null,
    mouvementsFoetaux: null,
    oedemes: null,
    tpiDose: null,
    moustiquaireImpregnee: null,
    vatDose: null,
    ferAcideFolique: null,
    albuminurie: null,
    glycosurie: null,
    vih: null,
    prochainRdv: null,
    modeAccouchement: null,
    dureeTravailHeures: null,
    assistePar: null,
    issueGrossesse: null,
    sexeNouveauNe: null,
    poidsNaissanceG: null,
    apgar1min: null,
    apgar5min: null,
    perimetreCranienCm: null,
    reanimationNouveauNe: null,
    complicationsAccouchement: null,
    episiotomie: null,
    placentaComplet: null,
    cponNumeroVisite: null,
    joursPostPartum: null,
    etatPerinee: null,
    allaitement: null,
    planificationFamiliale: null,
    etatNouveauNeCpon: null,
    vaccinationBcgFait: null,
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

describe('GET /api/maternite', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/maternite?type=CPN'));
    expect(res.status).toBe(401);
  });

  it('missing type query param → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/maternite'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.maternite.findMany).not.toHaveBeenCalled();
  });

  it('invalid type query param → 400 VALIDATION_FAILED', async () => {
    const res = await GET(makeGet('http://test/api/maternite?type=INVALID'));
    expect(res.status).toBe(400);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/maternite?type=CPN'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('serializes rows with patient + providerName', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([materniteRow()] as never);
    const res = await GET(makeGet('http://test/api/maternite?type=CPN'));
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
    expect(body.items[0].type).toBe('CPN');
  });

  it('serializes indigent/telephoneContact/localisationPrecise', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([
      materniteRow({
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
      }),
    ] as never);
    const res = await GET(makeGet('http://test/api/maternite?type=CPN'));
    const body = await res.json();
    expect(body.items[0].indigent).toBe(true);
    expect(body.items[0].telephoneContact).toBe('76 00 00 00');
    expect(body.items[0].localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
  });

  it('providerName is null when the record has no provider', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([materniteRow({ provider: null })] as never);
    const res = await GET(makeGet('http://test/api/maternite?type=CPN'));
    const body = await res.json();
    expect(body.items[0].providerName).toBeNull();
  });

  it('?type= is passed through to the Prisma where clause', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/maternite?type=ACCOUCHEMENT'));
    const args = prismaMock.maternite.findMany.mock.calls[0]?.[0];
    expect(args?.where?.type).toBe('ACCOUCHEMENT');
  });

  it('defaults the date filter to the start of today', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/maternite?type=CPN'));
    const args = prismaMock.maternite.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-12T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-01-13T00:00:00'));
  });

  it('?dateFrom=&dateTo= filters a range', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/maternite?type=CPN&dateFrom=2026-01-01&dateTo=2026-01-31'));
    const args = prismaMock.maternite.findMany.mock.calls[0]?.[0];
    const dateFilter = args?.where?.date as { gte?: Date; lt?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(dateFilter.lt).toEqual(new Date('2026-02-01T00:00:00'));
  });

  it('?q= searches the related patient nom/prenom/dossierNumber (insensitive)', async () => {
    prismaMock.maternite.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/maternite?type=CPN&q=Traor%C3%A9'));
    const args = prismaMock.maternite.findMany.mock.calls[0]?.[0];
    const patientFilter = args?.where?.patient as { OR?: Array<Record<string, unknown>> };
    expect(patientFilter.OR).toHaveLength(3);
    expect(patientFilter.OR?.[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });
});
