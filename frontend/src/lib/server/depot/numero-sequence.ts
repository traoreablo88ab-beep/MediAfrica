import 'server-only';

import type { Prisma } from '@prisma/client';

// Strictly sequential, gap-free (except for an "annulee" row) numbering per
// organization — same anti-fraud mechanic as
// lib/server/guichet/numero-sequence.ts, applied to DepotVente
// (.planning/prd-depot-medicaments.md § 2). Derived from the highest
// existing numeroSequence, not a row count, so the sequence itself stays
// meaningful (no unexplained gap) rather than merely unique.
//
// Must run inside the same transaction as the DepotVente insert; the caller
// additionally retries the whole transaction on a P2002 for
// `numeroSequence`, since max+1 still has the same read-then-write race as
// any max-based scheme under concurrent creates.
export async function generateNumeroSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  const last = await tx.depotVente.findFirst({
    where: { organizationId },
    orderBy: { numeroSequence: 'desc' },
    select: { numeroSequence: true },
  });
  return (last?.numeroSequence ?? 0) + 1;
}
