import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { generateDossierNumber } from './dossier-number';

function fakeTx(lastDossierNumber: string | null): Prisma.TransactionClient {
  return {
    patient: {
      findFirst: vi
        .fn()
        .mockResolvedValue(lastDossierNumber ? { dossierNumber: lastDossierNumber } : null),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('generateDossierNumber', () => {
  it('formats as P-{year}{4-digit seq} starting at 0001 when no prior patients this year', async () => {
    const tx = fakeTx(null);
    const result = await generateDossierNumber(tx, new Date('2026-01-15T00:00:00Z'));
    expect(result).toBe('P-20260001');
  });

  it('increments off the highest existing dossier number for the year', async () => {
    const tx = fakeTx('P-20250186');
    const result = await generateDossierNumber(tx, new Date('2025-06-01T00:00:00Z'));
    expect(result).toBe('P-20250187');
  });

  it('scopes the lookup to the given year prefix, ordered descending', async () => {
    const tx = fakeTx(null);
    await generateDossierNumber(tx, new Date('2024-03-01T00:00:00Z'));
    const findFirstMock = tx.patient.findFirst as ReturnType<typeof vi.fn>;
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { dossierNumber: { startsWith: 'P-2024' } },
      orderBy: { dossierNumber: 'desc' },
      select: { dossierNumber: true },
    });
  });

  it('stays past a gap left by a deleted patient instead of reissuing a number still in use elsewhere', async () => {
    // Regression test: a count-based "next = count + 1" would recompute a
    // lower number here once a patient is deleted (count drops), colliding
    // with another organization's surviving P-20260187. Max-based never
    // goes backward — the highest number ever issued for the year is still
    // P-20260187 even though only, say, 40 patients now exist for it.
    const tx = fakeTx('P-20260187');
    const result = await generateDossierNumber(tx, new Date('2026-09-01T00:00:00Z'));
    expect(result).toBe('P-20260188');
  });
});
