import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireOrgMember: vi.fn(),
}));

import { requireOrgMember } from '@/lib/server/middleware';
import { PATCH } from './route';

const mockRequireOrgMember = vi.mocked(requireOrgMember);

function ctxWith(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
  return {
    user: { sub: 'user-1', email: 'staff@example.com' },
    orgMember: { organizationId: 'org-1', role },
  };
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/depot/produits/p-1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

function callPatch(body: unknown, id = 'p-1', opts?: { csrf?: 'match' | 'missing' }) {
  return PATCH(makePatch(body, opts), { params: Promise.resolve({ id }) });
}

function produitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    organizationId: 'org-1',
    nom: 'Paracétamol',
    prixUnitaire: 200,
    stockActuel: 50,
    seuilAlerteStock: 10,
    actif: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('ADMIN'));
  prismaMock.medicamentProduit.findFirst.mockResolvedValue(produitRow() as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PATCH /api/depot/produits/[id]', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await callPatch({ nom: 'Ibuprofène' }, 'p-1', { csrf: 'missing' });
    expect(res.status).toBe(403);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await callPatch({ nom: 'Ibuprofène' });
    expect(res.status).toBe(401);
  });

  it('403 ORG_ROLE_INSUFFICIENT for a MEMBER', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('MEMBER'));
    const res = await callPatch({ nom: 'Ibuprofène' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('empty body → 400 VALIDATION_FAILED (at least one field required)', async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('not found in this org → 404', async () => {
    prismaMock.medicamentProduit.findFirst.mockResolvedValue(null);
    const res = await callPatch({ nom: 'Ibuprofène' }, 'p-missing');
    expect(res.status).toBe(404);
    expect(prismaMock.medicamentProduit.update).not.toHaveBeenCalled();
  });

  it('stockActuel is not a patchable field — silently ignored, not forwarded to Prisma', async () => {
    prismaMock.medicamentProduit.update.mockResolvedValue(
      produitRow({ prixUnitaire: 250 }) as never,
    );
    const res = await callPatch({ prixUnitaire: 250, stockActuel: 9999 });
    expect(res.status).toBe(200);
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { prixUnitaire: 250 },
    });
  });

  it('happy path: patches nom, prixUnitaire, seuilAlerteStock and actif together', async () => {
    prismaMock.medicamentProduit.update.mockResolvedValue(
      produitRow({
        nom: 'Paracétamol 1g',
        prixUnitaire: 250,
        seuilAlerteStock: 20,
        actif: false,
      }) as never,
    );
    const res = await callPatch({
      nom: 'Paracétamol 1g',
      prixUnitaire: 250,
      seuilAlerteStock: 20,
      actif: false,
    });
    expect(res.status).toBe(200);
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { nom: 'Paracétamol 1g', prixUnitaire: 250, seuilAlerteStock: 20, actif: false },
    });
    const body = await res.json();
    expect(body.nom).toBe('Paracétamol 1g');
    expect(body.actif).toBe(false);
  });

  it('seuilAlerteStock can be cleared back to null', async () => {
    prismaMock.medicamentProduit.update.mockResolvedValue(
      produitRow({ seuilAlerteStock: null }) as never,
    );
    const res = await callPatch({ seuilAlerteStock: null });
    expect(res.status).toBe(200);
    expect(prismaMock.medicamentProduit.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { seuilAlerteStock: null },
    });
  });
});
