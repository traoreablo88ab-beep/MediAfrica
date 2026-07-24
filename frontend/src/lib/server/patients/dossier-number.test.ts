import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { generateDossierNumber } from './dossier-number';

function fakeTx(count: number): Prisma.TransactionClient {
  return {
    patient: { count: vi.fn().mockResolvedValue(count) },
  } as unknown as Prisma.TransactionClient;
}

describe('generateDossierNumber', () => {
  it('formats as P-{year}{4-digit seq} starting at 0001 when no prior patients this year', async () => {
    const tx = fakeTx(0);
    const result = await generateDossierNumber(tx, new Date('2026-01-15T00:00:00Z'));
    expect(result).toBe('P-20260001');
  });

  it('increments off the current per-year count', async () => {
    const tx = fakeTx(186);
    const result = await generateDossierNumber(tx, new Date('2025-06-01T00:00:00Z'));
    expect(result).toBe('P-20250187');
  });

  it('scopes the count query to the given year prefix', async () => {
    const tx = fakeTx(0);
    await generateDossierNumber(tx, new Date('2024-03-01T00:00:00Z'));
    const countMock = tx.patient.count as ReturnType<typeof vi.fn>;
    expect(countMock).toHaveBeenCalledWith({
      where: { dossierNumber: { startsWith: 'P-2024' } },
    });
  });
});
