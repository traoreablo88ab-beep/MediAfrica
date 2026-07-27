import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PATCH } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/patients/pt-1', { method: 'GET' });
}

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/patients/pt-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function fullPatient() {
  return {
    id: 'pt-1',
    dossierNumber: 'P-20260001',
    nom: 'Keïta',
    prenom: 'Fatoumata',
    dateNaissance: new Date('1990-03-12T00:00:00Z'),
    sexe: 'F',
    telephonePrincipal: '+22376432109',
    telephoneSecondaire: null,
    communeResidence: 'Commune V, Bamako',
    quartierVillage: null,
    contactUrgenceNom: null,
    contactUrgenceTelephone: null,
    numeroRamed: null,
    numeroAmo: null,
    groupeSanguin: 'A+',
    allergiesConnues: 'Pénicilline',
    antecedentsPersonnels: null,
    antecedentsChirurgicaux: null,
    antecedentsFamiliaux: null,
    createdAt: new Date('2026-01-12T00:00:00Z'),
    updatedAt: new Date('2026-01-12T00:00:00Z'),
    consultations: [
      {
        id: 'c-1',
        date: new Date('2026-01-12T07:45:00Z'),
        motif: 'Paludisme simple',
        status: 'traite',
        diagnostic: 'Paludisme non compliqué',
        traitementPrescrit: 'Coartem',
        tensionArterielle: '118/76',
        poidsKg: 62,
        tailleCm: 95,
        perimetreBrachialCm: 13.5,
        statutPT: 'Normal',
        temperatureC: 38.4,
        typeCas: 'NC',
        mdo: false,
        mdoMaladie: null,
        tdr: 'Négatif',
        ge: null,
        provider: { name: 'Amadou Diallo' },
      },
    ],
    maternites: [
      {
        id: 'm-1',
        date: new Date('2026-02-01T09:00:00Z'),
        type: 'CPN',
        cpnNumeroVisite: 2,
        ageGestationnelSemaines: 24,
        prochainRdv: new Date('2026-03-01T00:00:00Z'),
        modeAccouchement: null,
        issueGrossesse: null,
        sexeNouveauNe: null,
        poidsNaissanceG: null,
        observations: null,
        provider: { name: 'Fatoumata Sow' },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/patients/[id]', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet(), ctxWith('pt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 PATIENT_NOT_FOUND when the patient does not exist', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await GET(makeGet(), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PATIENT_NOT_FOUND');
  });

  it('happy path: includes patient fields and consultation history with provider name', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    const res = await GET(makeGet(), ctxWith('pt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dossierNumber).toBe('P-20260001');
    expect(body.dateNaissance).toBe('1990-03-12T00:00:00.000Z');
    expect(body.consultations).toHaveLength(1);
    expect(body.consultations[0].providerName).toBe('Amadou Diallo');
    expect(body.consultations[0].tensionArterielle).toBe('118/76');
    expect(body.consultations[0].tailleCm).toBe(95);
    expect(body.consultations[0].perimetreBrachialCm).toBe(13.5);
    expect(body.consultations[0].statutPT).toBe('Normal');
    expect(body.consultations[0].typeCas).toBe('NC');
    expect(body.consultations[0].mdo).toBe(false);
    expect(body.consultations[0].tdr).toBe('Négatif');
    expect(body.consultations[0].ge).toBe(null);
    expect(body.maternites).toHaveLength(1);
    expect(body.maternites[0].type).toBe('CPN');
    expect(body.maternites[0].cpnNumeroVisite).toBe(2);
    expect(body.maternites[0].providerName).toBe('Fatoumata Sow');
  });

  it('queries with the id-scoped consultations include, ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ id: 'pt-1', organizationId: 'org-1' });
    const consultInclude = (
      arg?.include as { consultations?: { orderBy?: unknown; take?: number } }
    )?.consultations;
    expect(consultInclude?.orderBy).toEqual({ date: 'desc' });
    expect(consultInclude?.take).toBe(20);
  });

  it('queries maternites filtered to CPN/ACCOUCHEMENT, ordered desc, take 20', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    await GET(makeGet(), ctxWith('pt-1'));
    const arg = prismaMock.patient.findFirst.mock.calls[0]?.[0];
    const materniteInclude = (
      arg?.include as {
        maternites?: { where?: unknown; orderBy?: unknown; take?: number };
      }
    )?.maternites;
    expect(materniteInclude?.where).toEqual({ type: { in: ['CPN', 'ACCOUCHEMENT'] } });
    expect(materniteInclude?.orderBy).toEqual({ date: 'desc' });
    expect(materniteInclude?.take).toBe(20);
  });
});

describe('PATCH /api/patients/[id]', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makePatch({ nom: 'Traoré' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF verification fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ nom: 'Traoré' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_FAILED on an invalid body', async () => {
    const res = await PATCH(makePatch({ sexe: 'X' }), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 404 PATIENT_NOT_FOUND when the patient does not exist', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await PATCH(makePatch({ nom: 'Traoré' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PATIENT_NOT_FOUND');
  });

  it('happy path: updates only the provided fields', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    prismaMock.patient.update.mockResolvedValue({
      ...fullPatient(),
      nom: 'Traoré',
      prenom: 'Ablo',
    } as never);

    const res = await PATCH(makePatch({ nom: 'Traoré', prenom: 'Ablo' }), ctxWith('pt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nom).toBe('Traoré');
    expect(body.prenom).toBe('Ablo');

    const arg = prismaMock.patient.update.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ id: 'pt-1' });
    expect(arg?.data).toEqual({ nom: 'Traoré', prenom: 'Ablo' });
  });

  it('passes through numeroAmo', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(fullPatient() as never);
    prismaMock.patient.update.mockResolvedValue({
      ...fullPatient(),
      numeroAmo: 'AMO-5678',
    } as never);

    await PATCH(makePatch({ numeroAmo: 'AMO-5678' }), ctxWith('pt-1'));

    const arg = prismaMock.patient.update.mock.calls[0]?.[0];
    expect(arg?.data).toEqual({ numeroAmo: 'AMO-5678' });
  });
});
