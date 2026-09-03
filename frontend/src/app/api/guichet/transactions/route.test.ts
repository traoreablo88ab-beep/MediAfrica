import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { GET, POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER', sub = 'user-1') {
  return {
    user: { sub, email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makeGet(url = 'http://test/api/guichet/transactions'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/guichet/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const activeTariff = {
  id: 'tr-1',
  organizationId: 'org-1',
  tarif: 1000,
  actif: true,
  libelle: 'Consultation',
};

function txRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gt-1',
    organizationId: 'org-1',
    numeroSequence: 1,
    patientNom: 'Awa Traoré',
    patientId: null,
    typeRecetteId: 'tr-1',
    montant: 1000,
    modePaiement: 'especes',
    guichetierId: 'user-1',
    statut: 'emise',
    annulationMotif: null,
    annulationParId: null,
    annulationAt: null,
    remiseAppliquee: null,
    remiseMotif: null,
    createdAt: new Date('2026-01-12T09:00:00Z'),
    typeRecette: { libelle: 'Consultation' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('MEMBER'));
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.typeRecette.findFirst.mockResolvedValue(activeTariff as never);
  prismaMock.guichetTransaction.findFirst.mockResolvedValue(null); // no prior row → next seq = 1
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/guichet/transactions', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(
      makePost(
        { patientNom: 'Awa Traoré', typeRecetteId: 'tr-1', modePaiement: 'especes' },
        { csrf: 'missing' },
      ),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.guichetTransaction.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(
      makePost({ patientNom: 'Awa Traoré', typeRecetteId: 'tr-1', modePaiement: 'especes' }),
    );
    expect(res.status).toBe(401);
  });

  it('invalid modePaiement → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({ patientNom: 'Awa Traoré', typeRecetteId: 'tr-1', modePaiement: 'cheque' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('remiseAppliquee without remiseMotif → 400 VALIDATION_FAILED', async () => {
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        typeRecetteId: 'tr-1',
        modePaiement: 'especes',
        remiseAppliquee: 200,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('a MEMBER applying a remise → 403 ORG_ROLE_INSUFFICIENT (§5.2 is an ADMIN capability)', async () => {
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        typeRecetteId: 'tr-1',
        modePaiement: 'especes',
        remiseAppliquee: 200,
        remiseMotif: 'Indigent',
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.guichetTransaction.create).not.toHaveBeenCalled();
  });

  it('an ADMIN applying a remise larger than the tarif → 400 REMISE_EXCEEDS_TARIF', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN'));
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        typeRecetteId: 'tr-1',
        modePaiement: 'especes',
        remiseAppliquee: 5000,
        remiseMotif: 'Indigent',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('REMISE_EXCEEDS_TARIF');
  });

  it('unknown or inactive typeRecetteId → 400 TYPE_RECETTE_INVALID', async () => {
    prismaMock.typeRecette.findFirst.mockResolvedValue(null);
    const res = await POST(
      makePost({ patientNom: 'Awa Traoré', typeRecetteId: 'tr-x', modePaiement: 'especes' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('TYPE_RECETTE_INVALID');
  });

  it('patientId not found in this org → 404 PATIENT_NOT_FOUND', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        patientId: 'patient-1',
        typeRecetteId: 'tr-1',
        modePaiement: 'especes',
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PATIENT_NOT_FOUND');
  });

  it('happy path: emits with server-derived numeroSequence=1 and createdAt ignored from the client', async () => {
    prismaMock.guichetTransaction.create.mockResolvedValue(txRow() as never);
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        typeRecetteId: 'tr-1',
        modePaiement: 'especes',
        // a malicious/naive client trying to influence the server-derived fields:
        createdAt: '2000-01-01T00:00:00Z',
        numeroSequence: 999,
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.guichetTransaction.create.mock.calls[0]?.[0] as {
      data: { numeroSequence: number; createdAt?: unknown };
    };
    expect(createArgs.data.numeroSequence).toBe(1);
    expect(createArgs.data.createdAt).toBeUndefined();
    const body = await res.json();
    expect(body.numeroSequence).toBe(1);
    expect(body.montant).toBe(1000);
    expect(body.createdAt).toBe('2026-01-12T09:00:00.000Z');
  });

  it('numeroSequence derives from max+1, not a row count', async () => {
    prismaMock.guichetTransaction.findFirst.mockResolvedValue({ numeroSequence: 41 } as never);
    prismaMock.guichetTransaction.create.mockResolvedValue(txRow({ numeroSequence: 42 }) as never);
    await POST(
      makePost({ patientNom: 'Awa Traoré', typeRecetteId: 'tr-1', modePaiement: 'especes' }),
    );
    const createArgs = prismaMock.guichetTransaction.create.mock.calls[0]?.[0] as {
      data: { numeroSequence: number };
    };
    expect(createArgs.data.numeroSequence).toBe(42);
  });

  it('retries the transaction on a numeroSequence P2002 collision', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['organizationId', 'numeroSequence'] },
    });
    prismaMock.guichetTransaction.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(txRow() as never);
    const res = await POST(
      makePost({ patientNom: 'Awa Traoré', typeRecetteId: 'tr-1', modePaiement: 'especes' }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.guichetTransaction.create).toHaveBeenCalledTimes(2);
  });

  it('an ADMIN applying a valid remise succeeds and montant reflects the discount', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN'));
    prismaMock.guichetTransaction.create.mockResolvedValue(
      txRow({ montant: 800, remiseAppliquee: 200, remiseMotif: 'Indigent' }) as never,
    );
    const res = await POST(
      makePost({
        patientNom: 'Awa Traoré',
        typeRecetteId: 'tr-1',
        modePaiement: 'especes',
        remiseAppliquee: 200,
        remiseMotif: 'Indigent',
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.guichetTransaction.create.mock.calls[0]?.[0] as {
      data: { montant: number };
    };
    expect(createArgs.data.montant).toBe(800);
  });
});

describe('GET /api/guichet/transactions', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('a MEMBER only sees their own transactions for the day', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([]);
    await GET(makeGet());
    expect(prismaMock.guichetTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', guichetierId: 'user-1' }),
      }),
    );
  });

  it('an ADMIN sees every guichetier for the day (no guichetierId filter)', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN'));
    prismaMock.guichetTransaction.findMany.mockResolvedValue([]);
    await GET(makeGet());
    const args = prismaMock.guichetTransaction.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.guichetierId).toBeUndefined();
  });

  it('defaults to today, and honors an explicit ?date=', async () => {
    prismaMock.guichetTransaction.findMany.mockResolvedValue([]);
    await GET(makeGet('http://test/api/guichet/transactions?date=2026-01-05'));
    const args = prismaMock.guichetTransaction.findMany.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    };
    expect(args.where.createdAt.gte).toEqual(new Date('2026-01-05T00:00:00'));
    expect(args.where.createdAt.lt).toEqual(new Date('2026-01-06T00:00:00'));
  });
});
