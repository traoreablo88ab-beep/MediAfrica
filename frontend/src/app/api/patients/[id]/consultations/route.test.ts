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
  return new NextRequest('http://test/api/patients/pt-1/consultations', {
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

describe('POST /api/patients/[id]/consultations', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ motif: 'Fièvre' }, { csrf: 'missing' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ motif: 'Fièvre' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it('current month closed → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ motif: 'Fièvre' }), ctxWith('pt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it('missing motif → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('unknown patient → 404 PATIENT_NOT_FOUND; no Consultation created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ motif: 'Fièvre' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it('happy path: providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.consultation.create.mockResolvedValue({
      id: 'c-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      motif: 'Fièvre + céphalées',
      status: 'attente',
    } as never);

    const res = await POST(
      makePost({ motif: 'Fièvre + céphalées', providerId: 'someone-else' }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.consultation.create.mock.calls[0]?.[0];
    expect(createArg?.data?.providerId).toBe('user-1');
    expect(createArg?.data?.patientId).toBe('pt-1');
    expect((createArg?.data as Record<string, unknown>)?.motif).toBe('Fièvre + céphalées');
  });

  it('passes through anthropometric + typeCas/MDO fields', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.consultation.create.mockResolvedValue({
      id: 'c-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      motif: 'Rougeole suspectée',
      status: 'attente',
    } as never);

    const res = await POST(
      makePost({
        motif: 'Rougeole suspectée',
        tailleCm: 95,
        perimetreBrachialCm: 13.5,
        statutPT: 'Modérée',
        typeCas: 'NC',
        mdo: true,
        mdoMaladie: 'Rougeole',
        tdr: 'Positif',
        ge: 'Négatif',
        indigent: true,
        telephoneContact: '76 00 00 00',
        localisationPrecise: 'Quartier Sabalibougou, rue 214',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.consultation.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.tailleCm).toBe(95);
    expect(createArg.perimetreBrachialCm).toBe(13.5);
    expect(createArg.statutPT).toBe('Modérée');
    expect(createArg.typeCas).toBe('NC');
    expect(createArg.mdo).toBe(true);
    expect(createArg.mdoMaladie).toBe('Rougeole');
    expect(createArg.tdr).toBe('Positif');
    expect(createArg.ge).toBe('Négatif');
    expect(createArg.indigent).toBe(true);
    expect(createArg.telephoneContact).toBe('76 00 00 00');
    expect(createArg.localisationPrecise).toBe('Quartier Sabalibougou, rue 214');
  });

  describe('Idempotency-Key (offline-queue replay)', () => {
    it('no header → unchanged behavior, no idempotency fields on create', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.consultation.create.mockResolvedValue({
        id: 'c-1',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        motif: 'Fièvre',
        status: 'attente',
      } as never);

      const res = await POST(makePost({ motif: 'Fièvre' }), ctxWith('pt-1'));

      expect(res.status).toBe(201);
      expect(prismaMock.consultation.findUnique).not.toHaveBeenCalled();
      const createArg = prismaMock.consultation.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBeUndefined();
      expect(createArg.idempotencyBodyHash).toBeUndefined();
    });

    it('header + no existing row → creates and stores key/hash', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.consultation.findUnique.mockResolvedValue(null);
      prismaMock.consultation.create.mockResolvedValue({
        id: 'c-1',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        motif: 'Fièvre',
        status: 'attente',
      } as never);

      const res = await POST(
        makePost({ motif: 'Fièvre' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(201);
      const createArg = prismaMock.consultation.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBe('idem-key-1');
      expect(typeof createArg.idempotencyBodyHash).toBe('string');
    });

    it('header + matching replay → 200, no duplicate row created', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ patientId: 'pt-1', motif: 'Fièvre' }))
        .digest('hex');
      prismaMock.consultation.findUnique.mockResolvedValue({
        id: 'c-existing',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        motif: 'Fièvre',
        status: 'attente',
        idempotencyBodyHash: bodyHash,
        patient: { organizationId: 'org-1' },
      } as never);

      const res = await POST(
        makePost({ motif: 'Fièvre' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('c-existing');
      expect(prismaMock.consultation.create).not.toHaveBeenCalled();
    });

    it('header + mismatched body → 422 IDEMPOTENCY_KEY_BODY_MISMATCH', async () => {
      prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
      prismaMock.consultation.findUnique.mockResolvedValue({
        id: 'c-existing',
        patientId: 'pt-1',
        date: new Date('2026-01-12T09:00:00Z'),
        motif: 'Autre motif',
        status: 'attente',
        idempotencyBodyHash: 'deadbeef',
        patient: { organizationId: 'org-1' },
      } as never);

      const res = await POST(
        makePost({ motif: 'Fièvre' }, { idempotencyKey: 'idem-key-1' }),
        ctxWith('pt-1'),
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('IDEMPOTENCY_KEY_BODY_MISMATCH');
      expect(prismaMock.consultation.create).not.toHaveBeenCalled();
    });
  });
});
