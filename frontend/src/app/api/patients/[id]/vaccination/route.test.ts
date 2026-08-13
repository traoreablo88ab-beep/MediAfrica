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
  return new NextRequest('http://test/api/patients/pt-1/vaccination', {
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

describe('POST /api/patients/[id]/vaccination', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ antigene: 'BCG' }, { csrf: 'missing' }), ctxWith('pt-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.vaccination.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ antigene: 'BCG' }), ctxWith('pt-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.vaccination.create).not.toHaveBeenCalled();
  });

  it('current month closed → 409 REGISTER_CLOSED; no Prisma writes', async () => {
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await POST(makePost({ antigene: 'BCG' }), ctxWith('pt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.vaccination.create).not.toHaveBeenCalled();
    expect(prismaMock.registerClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId_registerType_month: expect.objectContaining({
            registerType: 'vaccination',
          }),
        }),
      }),
    );
  });

  it('missing antigene → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}), ctxWith('pt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('invalid voieAdministration → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ antigene: 'BCG', voieAdministration: 'INVALID' }),
      ctxWith('pt-1'),
    );
    expect(res.status).toBe(400);
  });

  it('invalid conseilsAme → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ antigene: 'BCG', conseilsAme: 'MAYBE' }), ctxWith('pt-1'));
    expect(res.status).toBe(400);
  });

  it('unknown patient → 404 PATIENT_NOT_FOUND; no Vaccination created', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(makePost({ antigene: 'BCG' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.vaccination.create).not.toHaveBeenCalled();
  });

  it('happy path: providerId is always the authenticated user, never client-supplied', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.vaccination.create.mockResolvedValue({
      id: 'v-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      antigene: 'Penta1',
    } as never);

    const res = await POST(
      makePost({
        providerId: 'someone-else',
        antigene: 'Penta1',
        numeroDose: 1,
        voieAdministration: 'Intramusculaire',
        siteInjection: 'Cuisse droite',
        numeroLot: 'LOT-2026-04',
        prochainRdv: '2026-02-12',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.vaccination.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.providerId).toBe('user-1');
    expect(createArg.patientId).toBe('pt-1');
    expect(createArg.antigene).toBe('Penta1');
    expect(createArg.numeroDose).toBe(1);
    expect(createArg.voieAdministration).toBe('Intramusculaire');
    expect(createArg.siteInjection).toBe('Cuisse droite');
    expect(createArg.numeroLot).toBe('LOT-2026-04');
  });

  it('accepts the PFPP/AME block (colonnes 46-51 du registre PEV officiel)', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'pt-1' } as never);
    prismaMock.vaccination.create.mockResolvedValue({
      id: 'v-1',
      patientId: 'pt-1',
      date: new Date('2026-01-12T09:00:00Z'),
      antigene: 'Penta1',
    } as never);

    const res = await POST(
      makePost({
        antigene: 'Penta1',
        dejaSousContraception: true,
        methodeContraceptivePrecedente: 'Pilule',
        pfppCounselingPropose: true,
        methodePfAdoptee: 'Injectable',
        conseilsAme: 'O',
        pratiqueAme: 'NA',
      }),
      ctxWith('pt-1'),
    );

    expect(res.status).toBe(201);
    const createArg = prismaMock.vaccination.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createArg.dejaSousContraception).toBe(true);
    expect(createArg.methodeContraceptivePrecedente).toBe('Pilule');
    expect(createArg.pfppCounselingPropose).toBe(true);
    expect(createArg.methodePfAdoptee).toBe('Injectable');
    expect(createArg.conseilsAme).toBe('O');
    expect(createArg.pratiqueAme).toBe('NA');
  });
});
