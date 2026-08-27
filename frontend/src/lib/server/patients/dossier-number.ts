import 'server-only';

import type { Prisma } from '@prisma/client';

// "P-20250187" — prefix + 4-digit year + 4-digit sequence within that year.
// The sequence is a single counter shared across every organization in the
// database (not per-clinic) — deliberate, so two clinics never collide on
// the same number even though each only ever sees its own patients.
//
// Derived from the highest existing number for the year, not a row count:
// a count-based "next = count + 1" silently reissues an already-used number
// the moment ANY patient for that year is deleted anywhere in the database
// (the count drops below the highest number still in use by a surviving
// patient elsewhere), which throws a unique-constraint error on create.
// Must run inside the same transaction as the Patient insert; the caller
// (frontend/src/app/api/patients/route.ts) additionally retries the whole
// transaction on a P2002 for `dossierNumber`, since max+1 still has the
// same fundamental read-then-write race as count+1 under concurrent
// creates — this fixes the number staying valid across deletions, not
// concurrent requests.
export async function generateDossierNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const prefix = `P-${now.getFullYear()}`;
  const last = await tx.patient.findFirst({
    where: { dossierNumber: { startsWith: prefix } },
    orderBy: { dossierNumber: 'desc' },
    select: { dossierNumber: true },
  });
  const lastSeq = last ? Number(last.dossierNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
}
