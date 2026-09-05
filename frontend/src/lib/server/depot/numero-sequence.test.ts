import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { generateNumeroSequence } from './numero-sequence';

function fakeTx(lastNumeroSequence: number | null): Prisma.TransactionClient {
  return {
    depotVente: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          lastNumeroSequence !== null ? { numeroSequence: lastNumeroSequence } : null,
        ),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('generateNumeroSequence', () => {
  it('starts at 1 when no prior sale exists for the org', async () => {
    const tx = fakeTx(null);
    const result = await generateNumeroSequence(tx, 'org-1');
    expect(result).toBe(1);
  });

  it('increments off the highest existing numeroSequence', async () => {
    const tx = fakeTx(41);
    const result = await generateNumeroSequence(tx, 'org-1');
    expect(result).toBe(42);
  });

  it('scopes the lookup to the given organization, ordered descending', async () => {
    const tx = fakeTx(null);
    await generateNumeroSequence(tx, 'org-1');
    const findFirstMock = tx.depotVente.findFirst as ReturnType<typeof vi.fn>;
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      orderBy: { numeroSequence: 'desc' },
      select: { numeroSequence: true },
    });
  });
});
