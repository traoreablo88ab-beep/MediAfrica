import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const VALID_BODY = { typeVisite: 'Nouvelle acceptante', methodeChoisie: 'Pilule COC' };

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/patients/pt-1/planification-familiale', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
});

describe('POST /api/patients/[id]/planification-familiale', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost(VALID_BODY, { csrf: 'missing' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.planificationFamiliale.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost(VALID_BODY), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.planificationFamiliale.create).not.toHaveBeenCalled();
  });

  it('current month closed → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost(VALID_BODY), ctxWith('pt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.planificationFamiliale.create).not.toHaveBeenCalled();
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'planification-familiale',
          }),
        }),
      }),
    );
  });

  it('missing typeVisite/methodeChoisie → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('invalid methodeChoisie → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ typeVisite: 'Nouvelle acceptante', methodeChoisie: 'INVALID' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(400);
  });

  it('unknown patient → 404 PATIENT_NOT_FOUND; no record created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost(VALID_BODY), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.planificationFamiliale.create).not.toHaveBeenCalled();
  });

  it('happy path: providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.planificationFamiliale.create.mockResolvedValue({
      id: 'pf-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      typeVisite: 'Nouvelle acceptante',
      methodeChoisie: 'Implanon',
    } as never);

    const res = await POST(
      makePost({
        providerId: 'someone-else',
        typeVisite: 'Nouvelle acceptante',
        methodeChoisie: 'Implanon',
        actionMethode: 'Insertion',
        counselingDonne: true,
        quantiteRemise: '1 implant (3 ans)',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.planificationFamiliale.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.providerId).toBe('user-1');
    expect(createArg.patientId).toBe('pt-1');
    expect(createArg.typeVisite).toBe('Nouvelle acceptante');
    expect(createArg.methodeChoisie).toBe('Implanon');
    expect(createArg.actionMethode).toBe('Insertion');
    expect(createArg.counselingDonne).toBe(true);
    expect(createArg.quantiteRemise).toBe('1 implant (3 ans)');
  });

  it('accepts the official-register fields (utilisateur, AME, vaccins enfant, service de provenance, PPI)', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.planificationFamiliale.create.mockResolvedValue({
      id: 'pf-2',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      typeVisite: 'Nouvelle acceptante',
      methodeChoisie: 'DIU',
    } as never);

    const res = await POST(
      makePost({
        typeVisite: 'Nouvelle acceptante',
        methodeChoisie: 'DIU',
        actionMethode: 'Post placentaire',
        typeUtilisateur: 'Nouveau',
        ageDernierEnfantMois: 2,
        pratiqueAme: 'O',
        enfantAJourVaccins: 'NA',
        conseilsAlimentationComplement: 'NA',
        serviceProvenance: 'Accouchement',
        ppi: true,
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.planificationFamiliale.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.actionMethode).toBe('Post placentaire');
    expect(createArg.typeUtilisateur).toBe('Nouveau');
    expect(createArg.ageDernierEnfantMois).toBe(2);
    expect(createArg.pratiqueAme).toBe('O');
    expect(createArg.enfantAJourVaccins).toBe('NA');
    expect(createArg.conseilsAlimentationComplement).toBe('NA');
    expect(createArg.serviceProvenance).toBe('Accouchement');
    expect(createArg.ppi).toBe(true);
  });

  it('invalid serviceProvenance → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ ...VALID_BODY, serviceProvenance: 'INVALID' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(400);
  });
});
