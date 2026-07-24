import 'server-only';

import type { Prisma } from '@prisma/client';

// "P-20250187" — prefix + 4-digit year + 4-digit sequence within that year.
// Must run inside the same transaction as the Patient insert to avoid a
// count/insert race producing a duplicate number under concurrent creates.
export async function generateDossierNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const prefix = `P-${now.getFullYear()}`;
  const count = await tx.patient.count({
    where: { dossierNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}
