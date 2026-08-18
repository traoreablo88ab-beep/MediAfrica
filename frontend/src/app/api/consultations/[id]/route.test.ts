import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { PATCH, DELETE } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/consultations/c-1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

function makeDelete(opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = {};
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/consultations/c-1', { method: 'DELETE', headers });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function consultationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c-1',
    patientId: 'pt-1',
    providerId: 'user-1',
    date: new Date('2026-01-12T07:45:00Z'),
    motif: 'Paludisme simple',
    status: 'attente',
    echelon: null,
    diagnostic: null,
    traitementPrescrit: null,
    tensionArterielle: null,
    poidsKg: null,
    temperatureC: null,
    indigent: null,
    codeAffection: null,
    deces: null,
    createdAt: new Date('2026-01-12T07:45:00Z'),
    updatedAt: new Date('2026-01-12T07:45:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
  prismaMock.registerClosure.findUnique.mockResolvedValue(null);
});

describe('PATCH /api/consultations/[id]', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await PATCH(makePatch({ status: 'traite' }, { csrf: 'missing' }), ctxWith('c-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makePatch({ status: 'traite' }), ctxWith('c-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it('invalid status value → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ status: 'annule' }), ctxWith('c-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it('empty body (neither status, indigent, echelon, codeAffection, nor deces) → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({}), ctxWith('c-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it('404 CONSULTATION_NOT_FOUND when the consultation does not exist', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: 'traite' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('CONSULTATION_NOT_FOUND');
  });

  it('month of the consultation is closed → 409 REGISTER_CLOSED; no update', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await PATCH(makePatch({ status: 'traite' }), ctxWith('c-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it('happy path: updates status, returns 200', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.consultation.update.mockResolvedValue(
      consultationRow({ status: 'traite' }) as never,
    );
    const res = await PATCH(makePatch({ status: 'traite' }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c-1',
      status: 'traite',
      indigent: null,
      echelon: null,
      codeAffection: null,
      deces: null,
    });
    const updateArg = prismaMock.consultation.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'c-1' });
    expect(updateArg?.data).toEqual({ status: 'traite' });
  });

  it('happy path: updates indigent only, returns 200', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.consultation.update.mockResolvedValue(consultationRow({ indigent: true }) as never);
    const res = await PATCH(makePatch({ indigent: true }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c-1',
      status: 'attente',
      indigent: true,
      echelon: null,
      codeAffection: null,
      deces: null,
    });
    const updateArg = prismaMock.consultation.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'c-1' });
    expect(updateArg?.data).toEqual({ indigent: true });
  });

  it('happy path: updates echelon (CSRéf → CSCom correction), returns 200', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.consultation.update.mockResolvedValue(
      consultationRow({ echelon: 'CSCom' }) as never,
    );
    const res = await PATCH(makePatch({ echelon: 'CSCom' }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c-1',
      status: 'attente',
      indigent: null,
      echelon: 'CSCom',
      codeAffection: null,
      deces: null,
    });
    const updateArg = prismaMock.consultation.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ echelon: 'CSCom' });
  });

  it('invalid echelon value → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ echelon: 'CHR' }), ctxWith('c-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it('happy path: sets codeAffection + deces together, returns 200', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.consultation.update.mockResolvedValue(
      consultationRow({ codeAffection: 'B05 — Rougeole', deces: true }) as never,
    );
    const res = await PATCH(
      makePatch({ codeAffection: 'B05 — Rougeole', deces: true }),
      ctxWith('c-1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c-1',
      status: 'attente',
      indigent: null,
      echelon: null,
      codeAffection: 'B05 — Rougeole',
      deces: true,
    });
    const updateArg = prismaMock.consultation.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ codeAffection: 'B05 — Rougeole', deces: true });
  });

  it('codeAffection: null clears the field (and deces along with it)', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(
      consultationRow({ codeAffection: 'B05 — Rougeole', deces: true }) as never,
    );
    prismaMock.consultation.update.mockResolvedValue(
      consultationRow({ codeAffection: null, deces: false }) as never,
    );
    const res = await PATCH(makePatch({ codeAffection: null, deces: false }), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const updateArg = prismaMock.consultation.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ codeAffection: null, deces: false });
  });

  it('empty-string codeAffection → 400 VALIDATION_FAILED (use null to clear)', async () => {
    const res = await PATCH(makePatch({ codeAffection: '' }), ctxWith('c-1'));
    expect(res.status).toBe(400);
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/consultations/[id]', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await DELETE(makeDelete({ csrf: 'missing' }), ctxWith('c-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.consultation.delete).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await DELETE(makeDelete(), ctxWith('c-1'));
    expect(res.status).toBe(401);
    expect(prismaMock.consultation.delete).not.toHaveBeenCalled();
  });

  it('404 CONSULTATION_NOT_FOUND when the consultation does not exist', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeDelete(), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('CONSULTATION_NOT_FOUND');
  });

  it('month of the consultation is closed → 409 REGISTER_CLOSED; no delete', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.registerClosure.findUnique.mockResolvedValue({ id: 'rc-1' } as never);
    const res = await DELETE(makeDelete(), ctxWith('c-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REGISTER_CLOSED');
    expect(prismaMock.consultation.delete).not.toHaveBeenCalled();
  });

  it('happy path: deletes the consultation, returns 200', async () => {
    prismaMock.consultation.findFirst.mockResolvedValue(consultationRow() as never);
    prismaMock.consultation.delete.mockResolvedValue(consultationRow() as never);
    const res = await DELETE(makeDelete(), ctxWith('c-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(prismaMock.consultation.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });
});
