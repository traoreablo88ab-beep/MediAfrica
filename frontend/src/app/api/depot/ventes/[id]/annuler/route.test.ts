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
    user: { sub, email: 'gerant@example.com' },
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
  return new NextRequest('http://test/api/depot/ventes/v-1/annuler', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function callPost(body: unknown, id = 'v-1', opts?: { csrf?: 'match' | 'missing' }) {
  return POST(makePost(body, opts), { params: Promise.resolve({ id }) });
}

function venteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    organizationId: 'org-1',
    numeroSequence: 1,
    gerantId: 'user-1',
    statut: 'emise',
    annulationMotif: null,
    annulationParId: null,
    annulationAt: null,
    lignes: [
      { id: 'l-1', produitId: 'prod-1', quantite: 3 },
      { id: 'l-2', produitId: 'prod-2', quantite: 1 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('MEMBER'));
  prismaMock.depotVente.findFirst.mockResolvedValue(venteRow() as never);
  prismaMock.medicamentProduit.findUniqueOrThrow.mockResolvedValue({ stockActuel: 10 } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/depot/ventes/[id]/annuler', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await callPost({ motif: 'Erreur de saisie' }, 'v-1', { csrf: 'missing' });
    expect(res.status).toBe(403);
    expect(prismaMock.depotVente.update).not.toHaveBeenCalled();
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
    expect(prismaMock.depotVente.update).not.toHaveBeenCalled();
  });

  it('not found in this org → 404', async () => {
    prismaMock.depotVente.findFirst.mockResolvedValue(null);
    const res = await callPost({ motif: 'Erreur de saisie' }, 'v-missing');
    expect(res.status).toBe(404);
    expect(prismaMock.depotVente.update).not.toHaveBeenCalled();
  });

  it("a MEMBER cannot cancel another gérant's sale → 403", async () => {
    prismaMock.depotVente.findFirst.mockResolvedValue(
      venteRow({ gerantId: 'other-user' }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.depotVente.update).not.toHaveBeenCalled();
  });

  it('a MEMBER can cancel their own sale', async () => {
    prismaMock.depotVente.update.mockResolvedValue(
      venteRow({
        statut: 'annulee',
        annulationMotif: 'Erreur de saisie',
        annulationParId: 'user-1',
        annulationAt: new Date(),
      }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(200);
  });

  it("an ADMIN can cancel any gérant's sale", async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN', 'admin-1'));
    prismaMock.depotVente.findFirst.mockResolvedValue(
      venteRow({ gerantId: 'other-user' }) as never,
    );
    prismaMock.depotVente.update.mockResolvedValue(
      venteRow({ gerantId: 'other-user', statut: 'annulee' }) as never,
    );
    const res = await callPost({ motif: 'Erreur de stock constatée' });
    expect(res.status).toBe(200);
  });

  it('already-cancelled sale → 409 ALREADY_CANCELLED', async () => {
    prismaMock.depotVente.findFirst.mockResolvedValue(venteRow({ statut: 'annulee' }) as never);
    const res = await callPost({ motif: 'Erreur de saisie' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_CANCELLED');
    expect(prismaMock.depotVente.update).not.toHaveBeenCalled();
  });

  it('happy path: restores each line to stock and sets statut=annulee with server clock', async () => {
    prismaMock.depotVente.update.mockResolvedValue(
      venteRow({
        statut: 'annulee',
        annulationMotif: 'Erreur de saisie',
        annulationParId: 'user-1',
        annulationAt: new Date('2026-01-12T09:00:00Z'),
      }) as never,
    );
    const res = await callPost({ motif: 'Erreur de saisie', annulationAt: '2000-01-01T00:00:00Z' });
    expect(res.status).toBe(200);

    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.depotMouvementStock.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        produitId: 'prod-1',
        type: 'annulation_vente',
        quantite: 3,
        venteId: 'v-1',
        auteurId: 'user-1',
      }),
    });
    expect(prismaMock.depotMouvementStock.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        produitId: 'prod-2',
        type: 'annulation_vente',
        quantite: 1,
        venteId: 'v-1',
        auteurId: 'user-1',
      }),
    });

    expect(prismaMock.depotVente.update).toHaveBeenCalledWith({
      where: { id: 'v-1' },
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
