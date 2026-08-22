import { createHash } from 'node:crypto';
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

function makePost(
  body: unknown,
  opts: { csrf?: 'match' | 'missing'; idempotencyKey?: string } = {},
): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  if (opts.idempotencyKey) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }
  return new NextRequest('http://test/api/patients/pt-1/nutrition', {
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

describe('POST /api/patients/[id]/nutrition', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ type: 'URENI' }, { csrf: 'missing' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ type: 'URENI' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
  });

  it('current month closed for the submitted type → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ type: 'URENI' }), ctxWith('pt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition-ureni',
          }),
        }),
      }),
    );
  });

  it('closing one type does not block another (URENAS open while URENI is closed)', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue(null);
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.nutrition.create.mockResolvedValue({
      id: 'n-1',
      patientId: 'pt-1',
      type: 'URENAS',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);

    const res = await POST(makePost({ type: 'URENAS' }), ctxWith('pt-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'nutrition-urenas',
          }),
        }),
      }),
    );
  });

  it('invalid type → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ type: 'INVALID' }), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('unknown patient → 404 PATIENT_NOT_FOUND; no Nutrition created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ type: 'URENI' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
  });

  it('happy path (URENI): providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.nutrition.create.mockResolvedValue({
      id: 'n-1',
      patientId: 'pt-1',
      type: 'URENI',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        type: 'URENI',
        providerId: 'someone-else',
        numeroMas: 'MAS-2026-0042',
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
        ageMois: 18,
        modeAdmission: 'TN/REF',
        poidsKg: 6.4,
        tailleCm: 68,
        perimetreBrachialCm: 10.8,
        ptIndice: '-3 ET',
        oedemes: '++',
        pathologiesAssociees: 'Paludisme',
        nomPere: 'Ibrahim',
        nomMere: 'Fatoumata',
        allaite: true,
        jumeaux: false,
        parentsVivants: true,
        sourceAdmission: 'Référé',
        provenanceProgramme: 'URENAM',
        carteVaccination: true,
        vaccinationAJour: false,
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.nutrition.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.providerId).toBe('user-1');
    expect(createArg.patientId).toBe('pt-1');
    expect(createArg.type).toBe('URENI');
    expect(createArg.numeroMas).toBe('MAS-2026-0042');
    expect(createArg.telephoneContact).toBe('76 00 00 00');
    expect(createArg.localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
    expect(createArg.ageMois).toBe(18);
    expect(createArg.modeAdmission).toBe('TN/REF');
    expect(createArg.poidsKg).toBe(6.4);
    expect(createArg.tailleCm).toBe(68);
    expect(createArg.perimetreBrachialCm).toBe(10.8);
    expect(createArg.ptIndice).toBe('-3 ET');
    expect(createArg.oedemes).toBe('++');
    expect(createArg.pathologiesAssociees).toBe('Paludisme');
    expect(createArg.nomPere).toBe('Ibrahim');
    expect(createArg.nomMere).toBe('Fatoumata');
    expect(createArg.allaite).toBe(true);
    expect(createArg.jumeaux).toBe(false);
    expect(createArg.parentsVivants).toBe(true);
    expect(createArg.sourceAdmission).toBe('Référé');
    expect(createArg.provenanceProgramme).toBe('URENAM');
    expect(createArg.carteVaccination).toBe(true);
    expect(createArg.vaccinationAJour).toBe(false);
  });

  it('happy path (URENAM): passes through typeCas instead of modeAdmission', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.nutrition.create.mockResolvedValue({
      id: 'n-2',
      patientId: 'pt-1',
      type: 'URENAM',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        type: 'URENAM',
        typeCas: 'NC',
        poidsKg: 8.1,
        perimetreBrachialCm: 11.4,
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.nutrition.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.type).toBe('URENAM');
    expect(createArg.typeCas).toBe('NC');
    expect(createArg.modeAdmission).toBeUndefined();
  });

  it('happy path (URENAM): accepts typeCas "Réadmission" and sourceAdmission', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.nutrition.create.mockResolvedValue({
      id: 'n-3',
      patientId: 'pt-1',
      type: 'URENAM',
      date: new Date('2026-01-12T09:00:00Z'),
    } as never);

    const res = await POST(
      makePost({
        type: 'URENAM',
        typeCas: 'Réadmission',
        sourceAdmission: 'Dépistage actif',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.nutrition.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.type).toBe('URENAM');
    expect(createArg.typeCas).toBe('Réadmission');
    expect(createArg.sourceAdmission).toBe('Dépistage actif');
    expect(createArg.provenanceProgramme).toBeUndefined();
  });

  it('closure check uses the provided date month, not the current month', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(
      makePost({ type: 'URENI', date: '2025-12-20T09:00:00Z' }),
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

  describe('Idempotency-Key (offline-queue replay)', () => {
    it('no header → unchanged behavior, no idempotency fields on create', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.nutrition.create.mockResolvedValue({
        id: 'n-1',
        patientId: 'pt-1',
        type: 'URENI',
        date: new Date('2026-01-12T09:00:00Z'),
      } as never);

      const res = await POST(makePost({ type: 'URENI' }), ctxWith('pt-1'));

      expect(res.status).toBe(201);
      expect(prismaMock.nutrition.findUnique).not.toHaveBeenCalled();
      const createArg = prismaMock.nutrition.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBeUndefined();
      expect(createArg.idempotencyBodyHash).toBeUndefined();
    });

    it('header + no existing row → creates and stores key/hash', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.nutrition.findUnique.mockResolvedValue(null);
      prismaMock.nutrition.create.mockResolvedValue({
        id: 'n-1',
        patientId: 'pt-1',
        type: 'URENI',
        date: new Date('2026-01-12T09:00:00Z'),
      } as never);

      const res = await POST(
        makePost({ type: 'URENI' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(201);
      const createArg = prismaMock.nutrition.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBe('idem-key-1');
      expect(typeof createArg.idempotencyBodyHash).toBe('string');
    });

    it('header + matching replay → 200, no duplicate row created', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ patientId: 'pt-1', type: 'URENI', date: null }))
        .digest('hex');
      prismaMock.nutrition.findUnique.mockResolvedValue({
        id: 'n-existing',
        patientId: 'pt-1',
        type: 'URENI',
        date: new Date('2026-01-12T09:00:00Z'),
        idempotencyBodyHash: bodyHash,
        patient: { organizationId: 'org-1' },
      } as never);

      const res = await POST(
        makePost({ type: 'URENI' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('n-existing');
      expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
    });

    it('header + mismatched body → 422 IDEMPOTENCY_KEY_BODY_MISMATCH', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.nutrition.findUnique.mockResolvedValue({
        id: 'n-existing',
        patientId: 'pt-1',
        type: 'URENAS',
        date: new Date('2026-01-12T09:00:00Z'),
        idempotencyBodyHash: 'deadbeef',
        patient: { organizationId: 'org-1' },
      } as never);

      const res = await POST(
        makePost({ type: 'URENI' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('IDEMPOTENCY_KEY_BODY_MISMATCH');
      expect(prismaMock.nutrition.create).not.toHaveBeenCalled();
    });
  });
});
