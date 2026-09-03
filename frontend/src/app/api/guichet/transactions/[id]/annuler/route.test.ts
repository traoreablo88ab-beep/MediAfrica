import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER', sub = 'user-1') {
  return {
    user: { sub, email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/guichet/transactions/gt-1/annuler', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function callPost(body: unknown, id = 'gt-1', opts?: { csrf?: 'match' | 'missing' }) {
  return POST(makePost(body, opts), { params: Promise.resolve({ id }) });
}

function txRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gt-1',
    organizationId: 'org-1',
    numeroSequence: 1,
    guichetierId: 'user-1',
    statut: 'emise',
    annulationMotif: null,
    annulationParId: null,
    annulationAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('MEMBER'));
  prismaMock.guichetTransaction.findFirst.mockResolvedValue(txRow() as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/guichet/transactions/[id]/annuler', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await callPost({ motif: 'Erreur de saisie' }, 'gt-1', { csrf: 'missing' });
    expect(res.status).toBe(403);
    expect(prismaMock.guichetTransaction.update).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(401);
  });

  it('missing motif → 400 VALIDATION_FAILED; no Prisma calls', async () => {
    const res = await callPost({});
    expect(res.status).toBe(400);
    expect(prismaMock.guichetTransaction.update).not.toHaveBeenCalled();
  });

  it('empty motif → 400 VALIDATION_FAILED', async () => {
    const res = await callPost({ motif: '' });
    expect(res.status).toBe(400);
  });

  it('not found in this org → 404', async () => {
    prismaMock.guichetTransaction.findFirst.mockResolvedValue(null);
    const res = await callPost({ motif: 'Erreur de saisie' }, 'gt-missing');
    expect(res.status).toBe(404);
    expect(prismaMock.guichetTransaction.update).not.toHaveBeenCalled();
  });

  it("a MEMBER cannot cancel another guichetier's transaction → 403", async () => {
    prismaMock.guichetTransaction.findFirst.mockResolvedValue(
      txRow({ guichetierId: 'other-user' }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.guichetTransaction.update).not.toHaveBeenCalled();
  });

  it('a MEMBER can cancel their own transaction', async () => {
    prismaMock.guichetTransaction.update.mockResolvedValue(
      txRow({
        statut: 'annulee',
        annulationMotif: 'Erreur de saisie',
        annulationParId: 'user-1',
        annulationAt: new Date(),
      }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(200);
  });

  it("an ADMIN can cancel any guichetier's transaction", async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN', 'admin-1'));
    prismaMock.guichetTransaction.findFirst.mockResolvedValue(
      txRow({ guichetierId: 'other-user' }) as never,
    );
    prismaMock.guichetTransaction.update.mockResolvedValue(
      txRow({ guichetierId: 'other-user', statut: 'annulee' }) as never,
    );
    const res = await callPost({ motif: 'Écart de caisse constaté' });
    expect(res.status).toBe(200);
  });

  it('already-cancelled transaction → 409 ALREADY_CANCELLED', async () => {
    prismaMock.guichetTransaction.findFirst.mockResolvedValue(
      txRow({ statut: 'annulee' }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_CANCELLED');
    expect(prismaMock.guichetTransaction.update).not.toHaveBeenCalled();
  });

  it('happy path: sets statut=annulee, records motif/annulationPar/annulationAt (server clock)', async () => {
    prismaMock.guichetTransaction.update.mockResolvedValue(
      txRow({
        statut: 'annulee',
        annulationMotif: 'Erreur de saisie',
        annulationParId: 'user-1',
        annulationAt: new Date('2026-01-12T09:00:00Z'),
      }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie', annulationAt: '2000-01-01T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(prismaMock.guichetTransaction.update).toHaveBeenCalledWith({
      where: { id: 'gt-1' },
      data: {
        statut: 'annulee',
        annulationMotif: 'Erreur de saisie',
        annulationParId: 'user-1',
        annulationAt: new Date('2026-01-12T09:00:00Z'),
      },
    });
    const body = await res.json();
    expect(body.statut).toBe('annulee');
    expect(body.annulationAt).toBe('2026-01-12T09:00:00.000Z');
  });
});
