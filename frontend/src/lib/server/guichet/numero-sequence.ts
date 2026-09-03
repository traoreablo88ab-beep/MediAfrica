import 'server-only';

import type { Prisma } from '@prisma/client';

// Strictly sequential, gap-free (except for an "annulee" row) numbering per
// organization — the anti-fraud core of the Guichet module (see
// .planning/prd-guichet-entree.md § 2, 4.1, 6.5). Derived from the highest
// existing numeroSequence for the org, not a row count: a count-based
// "next = count + 1" would silently reissue an already-used number, which
// GuichetTransaction's `@@unique([organizationId, numeroSequence])`
// constraint would reject anyway, but reasoning from the max is what keeps
// the sequence itself meaningful (no unexplained gap, per rule 6.5) rather
// than merely unique.
//
// Must run inside the same transaction as the GuichetTransaction insert;
// the caller (frontend/src/app/api/guichet/transactions/route.ts)
// additionally retries the whole transaction on a P2002 for
// `numeroSequence`, since max+1 still has the same fundamental
// read-then-write race as any max-based scheme under concurrent creates —
// same pattern as frontend/src/lib/server/patients/dossier-number.ts.
export async function generateNumeroSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  const last = await tx.guichetTransaction.findFirst({
    where: { organizationId },
    orderBy: { numeroSequence: 'desc' },
    select: { numeroSequence: true },
  });
  return (last?.numeroSequence ?? 0) + 1;
}
