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
  return new NextRequest('http://test/api/patients/pt-1/maternite', {
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

describe('POST /api/patients/[id]/maternite', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ type: 'CPN' }, { csrf: 'missing' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.maternite.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ type: 'CPN' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.maternite.create).not.toHaveBeenCalled();
  });

  it('current month closed for the submitted type → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ type: 'CPN' }), ctxWith('pt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.maternite.create).not.toHaveBeenCalled();
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'maternite-cpn',
          }),
        }),
      }),
    );
  });

  it('closing one type does not block another (accouchement register open while cpn is closed)', async () => {
    // Only the accouchement register is checked for this submission — its
    // closure lookup resolves to null (open), independent of any other
    // type's closure state.
    prismaMock.registerClosure.findUnique.mockResolvedValue(null);
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.maternite.create.mockResolvedValue({
      id: 'm-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      type: 'ACCOUCHEMENT',
    } as never);

    const res = await POST(makePost({ type: 'ACCOUCHEMENT' }), ctxWith('pt-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'maternite-accouchement',
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

  it('unknown patient → 404 PATIENT_NOT_FOUND; no Maternite created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ type: 'CPN' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.maternite.create).not.toHaveBeenCalled();
  });

  it('happy path (CPN): providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.maternite.create.mockResolvedValue({
      id: 'm-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      type: 'CPN',
    } as never);

    const res = await POST(
      makePost({
        type: 'CPN',
        providerId: 'someone-else',
        cpnNumeroVisite: 2,
        ageGestationnelSemaines: 24,
        poidsKg: 62.5,
        tensionArterielle: '110/70',
        bruitsCoeurFoetal: 'Perçus',
        tpiDose: 1,
        vih: 'Négatif',
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.maternite.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.providerId).toBe('user-1');
    expect(createArg.patientId).toBe('pt-1');
    expect(createArg.type).toBe('CPN');
    expect(createArg.cpnNumeroVisite).toBe(2);
    expect(createArg.ageGestationnelSemaines).toBe(24);
    expect(createArg.poidsKg).toBe(62.5);
    expect(createArg.tensionArterielle).toBe('110/70');
    expect(createArg.bruitsCoeurFoetal).toBe('Perçus');
    expect(createArg.tpiDose).toBe(1);
    expect(createArg.vih).toBe('Négatif');
    expect(createArg.indigent).toBe(true);
    expect(createArg.telephoneContact).toBe('76 00 00 00');
    expect(createArg.localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
  });

  it('happy path (ACCOUCHEMENT): passes through delivery fields', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.maternite.create.mockResolvedValue({
      id: 'm-2',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      type: 'ACCOUCHEMENT',
    } as never);

    const res = await POST(
      makePost({
        type: 'ACCOUCHEMENT',
        modeAccouchement: 'Voie basse',
        issueGrossesse: 'Vivant',
        sexeNouveauNe: 'F',
        poidsNaissanceG: 3200,
        apgar1min: 9,
        apgar5min: 10,
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.maternite.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.modeAccouchement).toBe('Voie basse');
    expect(createArg.issueGrossesse).toBe('Vivant');
    expect(createArg.sexeNouveauNe).toBe('F');
    expect(createArg.poidsNaissanceG).toBe(3200);
    expect(createArg.apgar1min).toBe(9);
    expect(createArg.apgar5min).toBe(10);
  });

  it('happy path (CPON): passes through postpartum fields', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.maternite.create.mockResolvedValue({
      id: 'm-3',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      type: 'CPON',
    } as never);

    const res = await POST(
      makePost({
        type: 'CPON',
        cponNumeroVisite: 1,
        joursPostPartum: 6,
        etatPerinee: 'Normal',
        allaitement: 'Exclusif',
        vaccinationBcgFait: true,
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.maternite.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.cponNumeroVisite).toBe(1);
    expect(createArg.joursPostPartum).toBe(6);
    expect(createArg.etatPerinee).toBe('Normal');
    expect(createArg.allaitement).toBe('Exclusif');
    expect(createArg.vaccinationBcgFait).toBe(true);
  });

  describe('Idempotency-Key (offline-queue replay)', () => {
    it('no header → unchanged behavior, no idempotency fields on create', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.maternite.create.mockResolvedValue({
        id: 'm-1',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        type: 'CPN',
      } as never);

      const res = await POST(makePost({ type: 'CPN' }), ctxWith('pt-1'));

      expect(res.status).toBe(201);
      expect(prismaMock.maternite.findUnique).not.toHaveBeenCalled();
      const createArg = prismaMock.maternite.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBeUndefined();
      expect(createArg.idempotencyBodyHash).toBeUndefined();
    });

    it('header + no existing row → creates and stores key/hash', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.maternite.findUnique.mockResolvedValue(null);
      prismaMock.maternite.create.mockResolvedValue({
        id: 'm-1',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        type: 'CPN',
      } as never);

      const res = await POST(
        makePost({ type: 'CPN' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(201);
      const createArg = prismaMock.maternite.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBe('idem-key-1');
      expect(typeof createArg.idempotencyBodyHash).toBe('string');
    });

    it('header + matching replay → 200, no duplicate row created', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      const bodyHash = createHash('sha256')
        .update(
          JSON.stringify({
            patientId: 'pt-1',
            type: 'CPN',
            cpnNumeroVisite: null,
            dateHeureEntree: null,
            cponNumeroVisite: null,
          }),
        )
        .digest('hex');
      prismaMock.maternite.findUnique.mockResolvedValue({
        id: 'm-existing',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        type: 'CPN',
        idempotencyBodyHash: bodyHash,
        patient: { organizationId: 'org-1' },
      } as never);

      const res = await POST(
        makePost({ type: 'CPN' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('m-existing');
      expect(prismaMock.maternite.create).not.toHaveBeenCalled();
    });

    it('header + mismatched body → 422 IDEMPOTENCY_KEY_BODY_MISMATCH', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.maternite.findUnique.mockResolvedValue({
        id: 'm-existing',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        type: 'ACCOUCHEMENT',
        idempotencyBodyHash: 'deadbeef',
        patient: { organizationId: 'org-1' },
      } as never);

      const res = await POST(
        makePost({ type: 'CPN' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('IDEMPOTENCY_KEY_BODY_MISMATCH');
      expect(prismaMock.maternite.create).not.toHaveBeenCalled();
    });
  });
});
