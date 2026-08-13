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

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/patients/pt-1/hospitalisation', {
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

describe('POST /api/patients/[id]/hospitalisation', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(
      makePost({ motifAdmission: 'Paludisme grave' }, { csrf: 'missing' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.hospitalisation.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ motifAdmission: 'Paludisme grave' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.hospitalisation.create).not.toHaveBeenCalled();
  });

  it('current month closed → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(
      makePost({ motifAdmission: 'Paludisme grave', service: 'Maternité' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.hospitalisation.create).not.toHaveBeenCalled();
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'hospitalisation',
          }),
        }),
      }),
    );
  });

  it('missing motifAdmission → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('unknown patient → 404 PATIENT_NOT_FOUND; no Hospitalisation created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ motifAdmission: 'Paludisme grave' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.hospitalisation.create).not.toHaveBeenCalled();
  });

  it('happy path: providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.hospitalisation.create.mockResolvedValue({
      id: 'h-1',
      patientId: 'pt-1',
      dateHeureEntree: new Date('2026-01-12T09:00:00Z'),
      motifAdmission: 'Paludisme grave',
    } as never);

    const res = await POST(
      makePost({
        providerId: 'someone-else',
        dateHeureEntree: '2026-01-10T08:30:00Z',
        motifAdmission: 'Paludisme grave',
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
        service: 'Pédiatrie',
        numeroHospitalisation: 'H-2026-0042',
        referenceOrigine: 'Csref',
        profession: 'Cultivateur',
        diagnosticPrincipal: 'Paludisme sévère avec anémie',
        praticienResponsable: 'Dr. Traoré',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.hospitalisation.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.providerId).toBe('user-1');
    expect(createArg.patientId).toBe('pt-1');
    expect(createArg.dateHeureEntree).toEqual(new Date('2026-01-10T08:30:00Z'));
    expect(createArg.motifAdmission).toBe('Paludisme grave');
    expect(createArg.indigent).toBe(true);
    expect(createArg.telephoneContact).toBe('76 00 00 00');
    expect(createArg.localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
    expect(createArg.service).toBe('Pédiatrie');
    expect(createArg.numeroHospitalisation).toBe('H-2026-0042');
    expect(createArg.referenceOrigine).toBe('Csref');
    expect(createArg.profession).toBe('Cultivateur');
    expect(createArg.diagnosticPrincipal).toBe('Paludisme sévère avec anémie');
    expect(createArg.praticienResponsable).toBe('Dr. Traoré');
  });

  it('accepts dateHeureSortie at admission time (backfilling a completed encounter)', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.hospitalisation.create.mockResolvedValue({
      id: 'h-1',
      patientId: 'pt-1',
      dateHeureEntree: new Date('2026-01-10T08:30:00Z'),
      motifAdmission: 'Paludisme grave',
    } as never);
    await POST(
      makePost({
        motifAdmission: 'Paludisme grave',
        dateHeureEntree: '2026-01-10T08:30:00Z',
        dateHeureSortie: '2026-01-15T10:00:00Z',
      }),
      ctxWith('pt-1'),
    );
    const createArg = prismaMock.hospitalisation.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.dateHeureSortie).toEqual(new Date('2026-01-15T10:00:00Z'));
  });

  it('omits dateHeureSortie from create() when not provided (still admitted)', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.hospitalisation.create.mockResolvedValue({
      id: 'h-1',
      patientId: 'pt-1',
      dateHeureEntree: new Date('2026-01-12T09:00:00Z'),
      motifAdmission: 'Paludisme grave',
    } as never);
    await POST(makePost({ motifAdmission: 'Paludisme grave' }), ctxWith('pt-1'));
    const createArg = prismaMock.hospitalisation.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.dateHeureSortie).toBeUndefined();
  });

  it('defaults dateHeureEntree to now (no explicit create override) when not provided', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.hospitalisation.create.mockResolvedValue({
      id: 'h-1',
      patientId: 'pt-1',
      dateHeureEntree: new Date('2026-01-12T09:00:00Z'),
      motifAdmission: 'Paludisme grave',
    } as never);
    await POST(makePost({ motifAdmission: 'Paludisme grave' }), ctxWith('pt-1'));
    const createArg = prismaMock.hospitalisation.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.dateHeureEntree).toBeUndefined();
  });

  it('closure check uses the provided dateHeureEntree month, not the current month', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(
      makePost({ motifAdmission: 'Paludisme grave', dateHeureEntree: '2025-12-20T09:00:00Z' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({ month: '2025-12' }),
        }),
      }),
    );
  });

  it('invalid referenceOrigine → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ motifAdmission: 'Paludisme grave', referenceOrigine: 'INVALID' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(400);
  });

  it('invalid service (e.g. Urgences typo) → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ motifAdmission: 'Paludisme grave', service: 'Urgence' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(400);
  });
});
