import { createHash } from 'node:crypto';
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
const authedCtx = {
  user: { sub: 'user-1', email: 'staff@example.com' },
  orgMember: { organizationId: 'org-1', role: 'OWNER' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
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
  return new NextRequest('http://test/api/patients', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function patientRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pt-1',
    dossierNumber: 'P-20260001',
    nom: 'Keïta',
    prenom: 'Fatoumata',
    dateNaissance: new Date('1990-03-12T00:00:00Z'),
    sexe: 'F',
    telephonePrincipal: '+22376432109',
    telephoneSecondaire: null,
    communeResidence: 'Commune V, Bamako',
    quartierVillage: null,
    contactUrgenceNom: null,
    contactUrgenceTelephone: null,
    numeroRamed: null,
    groupeSanguin: null,
    allergiesConnues: null,
    antecedentsPersonnels: null,
    antecedentsChirurgicaux: null,
    antecedentsFamiliaux: null,
    createdAt: new Date('2026-01-12T00:00:00Z'),
    updatedAt: new Date('2026-01-12T00:00:00Z'),
    consultations: [],
    ...overrides,
  };
}

const validBody = {
  nom: 'Keïta',
  prenom: 'Fatoumata',
  dateNaissance: '1990-03-12',
  sexe: 'F',
  telephonePrincipal: '+22376432109',
  communeResidence: 'Commune V, Bamako',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-12T09:00:00Z'));
  __cookieStore.clear();
  mockRequireOrgMember.mockResolvedValue(authedCtx);
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

describe('GET /api/patients', () => {
  it('returns 402 SUBSCRIPTION_INACTIVE when the clinic subscription is PAST_DUE', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ status: 'PAST_DUE' } as never);
    const res = await GET(makeGet('http://test/api/patients'));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('SUBSCRIPTION_INACTIVE');
    expect(prismaMock.patient.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when requireAuth bails', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet('http://test/api/patients'));
    expect(res.status).toBe(401);
  });

  it('empty result → { items: [], nextCursor: null }', async () => {
    prismaMock.patient.findMany.mockResolvedValue([] as never);
    const res = await GET(makeGet('http://test/api/patients'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('scopes the query to the caller organization', async () => {
    prismaMock.patient.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/patients'));
    const args = prismaMock.patient.findMany.mock.calls[0]?.[0];
    expect(args?.where?.organizationId).toBe('org-1');
  });

  it('serializes rows with their most recent consultation', async () => {
    prismaMock.patient.findMany.mockResolvedValue([
      patientRow({
        consultations: [
          {
            id: 'c-1',
            date: new Date('2026-01-12T07:45:00Z'),
            motif: 'Paludisme simple',
            status: 'traite',
          },
        ],
      }),
    ] as never);
    const res = await GET(makeGet('http://test/api/patients'));
    const body = await res.json();
    expect(body.items[0].dossierNumber).toBe('P-20260001');
    expect(body.items[0].latestConsultation).toEqual({
      id: 'c-1',
      date: '2026-01-12T07:45:00.000Z',
      motif: 'Paludisme simple',
      status: 'traite',
    });
  });

  it('?q= searches nom/prenom/dossierNumber/telephonePrincipal (insensitive)', async () => {
    prismaMock.patient.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/patients?q=Traor%C3%A9'));
    const args = prismaMock.patient.findMany.mock.calls[0]?.[0];
    const or = args?.where?.OR as Array<Record<string, unknown>>;
    expect(or).toHaveLength(4);
    expect(or[0]).toEqual({ nom: { contains: 'Traoré', mode: 'insensitive' } });
  });

  it('?sexe= and ?commune= filter directly on Patient fields', async () => {
    prismaMock.patient.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/patients?sexe=F&commune=Lafiabougou'));
    const args = prismaMock.patient.findMany.mock.calls[0]?.[0];
    expect(args?.where?.sexe).toBe('F');
    expect(args?.where?.communeResidence).toBe('Lafiabougou');
  });

  it('?status= filters via consultations.some scoped to today', async () => {
    prismaMock.patient.findMany.mockResolvedValue([] as never);
    await GET(makeGet('http://test/api/patients?status=urgent'));
    const args = prismaMock.patient.findMany.mock.calls[0]?.[0];
    const consultFilter = args?.where?.consultations as {
      some?: { status?: string; date?: { gte?: Date } };
    };
    expect(consultFilter.some?.status).toBe('urgent');
    expect(consultFilter.some?.date?.gte).toBeInstanceOf(Date);
  });
});

describe('POST /api/patients', () => {
  it('missing x-csrf-token header → 403; no Prisma calls', async () => {
    const res = await POST(makePost(validBody, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it('requireAuth bail → 401, no Prisma calls', async () => {
    mockRequireOrgMember.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(401);
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it('invalid body (missing required fields) → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ nom: 'Keïta' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it('happy path: generates dossierNumber inside the transaction, creates the patient, returns 201', async () => {
    // First findFirst call is the duplicate-name/phone check (no duplicate);
    // second is generateDossierNumber's max-lookup, inside the transaction
    // (both hit the same mock — $transaction's mockImplementation above
    // invokes the callback with prismaMock itself as `tx`).
    prismaMock.patient.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ dossierNumber: 'P-20260186' } as never);
    prismaMock.patient.create.mockResolvedValue(patientRow() as never);

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.dossierNumber).toBe('P-20260001');
    const createArg = prismaMock.patient.create.mock.calls[0]?.[0];
    expect(createArg?.data?.dossierNumber).toBe('P-20260187');
    expect(createArg?.data?.nom).toBe('Keïta');
    expect(createArg?.data?.organizationId).toBe('org-1');
  });

  it('passes through numeroRamed and numeroAmo', async () => {
    prismaMock.patient.create.mockResolvedValue(patientRow() as never);

    await POST(makePost({ ...validBody, numeroRamed: 'RM-1234', numeroAmo: 'AMO-5678' }));

    const createArg = prismaMock.patient.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(createArg.numeroRamed).toBe('RM-1234');
    expect(createArg.numeroAmo).toBe('AMO-5678');
  });

  it('same name+birthdate or same phone as an existing patient → 409 DUPLICATE_PATIENT, no create', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(
      patientRow({ id: 'pt-existing', dossierNumber: 'P-20260099' }) as never,
    );

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('DUPLICATE_PATIENT');
    expect(body.existingPatientId).toBe('pt-existing');
    expect(body.existingDossierNumber).toBe('P-20260099');
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it('force:true skips the duplicate check', async () => {
    prismaMock.patient.create.mockResolvedValue(patientRow() as never);

    const res = await POST(makePost({ ...validBody, force: true }));

    expect(res.status).toBe(201);
    // Only the dossier-number lookup (inside the transaction) runs — the
    // duplicate-name/phone check (a separate findFirst with an OR clause)
    // is the one force:true skips.
    expect(prismaMock.patient.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.patient.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { dossierNumber: { startsWith: 'P-2026' } },
    });
  });

  describe('Idempotency-Key (offline-queue replay)', () => {
    it('no header → unchanged behavior, no idempotency fields on create', async () => {
      prismaMock.patient.create.mockResolvedValue(patientRow() as never);

      const res = await POST(makePost(validBody));

      expect(res.status).toBe(201);
      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
      const createArg = prismaMock.patient.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBeUndefined();
      expect(createArg.idempotencyBodyHash).toBeUndefined();
    });

    it('header + no existing row → creates and stores key/hash', async () => {
      prismaMock.patient.findUnique.mockResolvedValue(null);
      prismaMock.patient.create.mockResolvedValue(patientRow() as never);

      const res = await POST(makePost(validBody, { idempotencyKey: 'idem-key-1' }));

      expect(res.status).toBe(201);
      const createArg = prismaMock.patient.create.mock.calls[0]?.[0]?.data as Record<
        string,
        unknown
      >;
      expect(createArg.idempotencyKey).toBe('idem-key-1');
      expect(typeof createArg.idempotencyBodyHash).toBe('string');
    });

    it('header + matching replay → 200, no duplicate row created, skips the DUPLICATE_PATIENT check', async () => {
      const bodyHash = createHash('sha256')
        .update(
          JSON.stringify({
            nom: validBody.nom,
            prenom: validBody.prenom,
            dateNaissance: new Date(validBody.dateNaissance).toISOString(),
            telephonePrincipal: validBody.telephonePrincipal,
          }),
        )
        .digest('hex');
      prismaMock.patient.findUnique.mockResolvedValue(
        patientRow({ idempotencyBodyHash: bodyHash, organizationId: 'org-1' }) as never,
      );

      const res = await POST(makePost(validBody, { idempotencyKey: 'idem-key-1' }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('pt-1');
      expect(prismaMock.patient.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.patient.create).not.toHaveBeenCalled();
    });

    it('header + mismatched body → 422 IDEMPOTENCY_KEY_BODY_MISMATCH', async () => {
      prismaMock.patient.findUnique.mockResolvedValue(
        patientRow({
          nom: 'Autre',
          idempotencyBodyHash: 'deadbeef',
          organizationId: 'org-1',
        }) as never,
      );

      const res = await POST(makePost(validBody, { idempotencyKey: 'idem-key-1' }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('IDEMPOTENCY_KEY_BODY_MISMATCH');
      expect(prismaMock.patient.create).not.toHaveBeenCalled();
    });
  });
});
