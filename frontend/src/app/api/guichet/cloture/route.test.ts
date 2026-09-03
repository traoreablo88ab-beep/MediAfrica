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

function makeGet(url = 'http://test/api/guichet/cloture'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/guichet/cloture', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(ctxWith('MEMBER'));
  prismaMock.clotureCaisse.findUnique.mockResolvedValue(null);
  prismaMock.guichetTransaction.aggregate.mockResolvedValue({ _sum: { montant: 0 } } as never);
  // checkEcartCaisse (§ 6.1) runs after every clôture — no history by default
  // so avgDailyCA=0 and small écarts stay silent (see the écart-critique test
  // below for the alert-firing path).
  prismaMock.guichetTransaction.findMany.mockResolvedValue([]);
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

describe('POST /api/guichet/cloture', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost({ recetteRemise: 1000 }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.clotureCaisse.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ recetteRemise: 1000 }));
    expect(res.status).toBe(401);
  });

  it('missing recetteRemise → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
    expect(prismaMock.clotureCaisse.create).not.toHaveBeenCalled();
  });

  it('already closed today → 409 ALREADY_CLOSED', async () => {
    prismaMock.clotureCaisse.findUnique.mockResolvedValue({ id: 'cc-1' } as never);
    const res = await POST(makePost({ recetteRemise: 1000 }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_CLOSED');
    expect(prismaMock.clotureCaisse.create).not.toHaveBeenCalled();
  });

  it('happy path: recetteTheorique is server-computed from emitted transactions, ecart derived', async () => {
    prismaMock.guichetTransaction.aggregate.mockResolvedValue({
      _sum: { montant: 4500 },
    } as never);
    prismaMock.clotureCaisse.create.mockResolvedValue({
      id: 'cc-1',
      dateService: new Date('2026-01-12T00:00:00'),
      recetteTheorique: 4500,
      recetteRemise: 4000,
      ecart: -500,
      createdAt: new Date('2026-01-12T09:00:00Z'),
    } as never);

    const res = await POST(makePost({ recetteRemise: 4000 }));
    expect(res.status).toBe(201);

    // aggregate is scoped to the caller's own guichetierId + only "emise"
    // transactions — a MEMBER can never inflate/deflate their own closure
    // by passing a recetteTheorique from the client (there is none to pass).
    const aggArgs = prismaMock.guichetTransaction.aggregate.mock.calls[0]?.[0] as {
      where: { guichetierId: string; statut: string };
    };
    expect(aggArgs.where.guichetierId).toBe('user-1');
    expect(aggArgs.where.statut).toBe('emise');

    expect(prismaMock.clotureCaisse.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        guichetierId: 'user-1',
        dateService: new Date('2026-01-12T00:00:00'),
        recetteTheorique: 4500,
        recetteRemise: 4000,
        ecart: -500,
      },
    });
    const body = await res.json();
    expect(body.ecart).toBe(-500);
  });

  it('no transactions emitted → recetteTheorique defaults to 0', async () => {
    prismaMock.clotureCaisse.create.mockResolvedValue({
      id: 'cc-1',
      dateService: new Date('2026-01-12T00:00:00'),
      recetteTheorique: 0,
      recetteRemise: 0,
      ecart: 0,
      createdAt: new Date('2026-01-12T09:00:00Z'),
    } as never);
    await POST(makePost({ recetteRemise: 0 }));
    expect(prismaMock.clotureCaisse.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recetteTheorique: 0 }) }),
    );
  });

  it('un écart supérieur à 10 000 FCFA déclenche une alerte critique (§ 6.1)', async () => {
    prismaMock.guichetTransaction.aggregate.mockResolvedValue({
      _sum: { montant: 20_000 },
    } as never);
    prismaMock.clotureCaisse.create.mockResolvedValue({
      id: 'cc-1',
      dateService: new Date('2026-01-12T00:00:00'),
      recetteTheorique: 20_000,
      recetteRemise: 5_000,
      ecart: -15_000,
      createdAt: new Date('2026-01-12T09:00:00Z'),
    } as never);
    prismaMock.organization.findUnique.mockResolvedValue({
      owner: { id: 'owner-1', email: 'owner@example.com' },
    } as never);
    prismaMock.guichetAlerte.create.mockResolvedValue({ id: 'al-1' } as never);

    const res = await POST(makePost({ recetteRemise: 5_000 }));

    expect(res.status).toBe(201);
    expect(prismaMock.guichetAlerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeAlerte: 'ecart_caisse', severite: 'critique' }),
      }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'guichet.alerte' }) }),
    );
  });
});

describe('GET /api/guichet/cloture', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('a MEMBER only sees their own closures for the day', async () => {
    prismaMock.clotureCaisse.findMany.mockResolvedValue([]);
    await GET(makeGet());
    expect(prismaMock.clotureCaisse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', guichetierId: 'user-1' }),
      }),
    );
  });

  it('an ADMIN sees every guichetier for the day', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(ctxWith('ADMIN'));
    prismaMock.clotureCaisse.findMany.mockResolvedValue([]);
    await GET(makeGet());
    const args = prismaMock.clotureCaisse.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.guichetierId).toBeUndefined();
  });
});
