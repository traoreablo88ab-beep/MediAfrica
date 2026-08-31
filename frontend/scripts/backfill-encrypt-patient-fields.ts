// One-time backfill: encrypts Patient sensitive fields written before
// frontend/src/lib/server/patients/sensitive-fields.ts existed.
//
// Idempotent — classifies each field by attempting decrypt() directly (not
// the tolerant wrapper): success means "already our ciphertext, skip",
// failure means "plaintext, encrypt it". Safe to re-run; already-encrypted
// rows are left untouched.
//
// Usage:
//   pnpm --filter frontend exec tsx scripts/backfill-encrypt-patient-fields.ts --dry-run
//   pnpm --filter frontend exec tsx scripts/backfill-encrypt-patient-fields.ts --write
//
// --dry-run (default if neither flag given) only counts and reports, no writes.
// --write encrypts in batches, and re-reads + decrypts every written row
// immediately after its update to confirm the round-trip before continuing —
// aborts on the first verification failure rather than pressing on.
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../src/lib/server/crypto';

// crypto.ts has no `server-only` guard, but sensitive-fields.ts does (it's
// meant to be imported only from route handlers) — a plain tsx script can't
// import it directly, so this script duplicates its tiny encrypt/decrypt
// wrapper logic locally instead of weakening that guard for script convenience.
function encryptSensitive(value: string, key: string): string {
  return encrypt(value, key);
}
function decryptSensitive(value: string, key: string): string {
  try {
    return decrypt(value, key);
  } catch {
    return value;
  }
}

const prisma = new PrismaClient();

const FIELDS = [
  'numeroRamed',
  'numeroAmo',
  'allergiesConnues',
  'antecedentsPersonnels',
  'antecedentsChirurgicaux',
  'antecedentsFamiliaux',
] as const;
type Field = (typeof FIELDS)[number];

const BATCH_SIZE = 200;

function isAlreadyEncrypted(value: string, key: string): boolean {
  try {
    decrypt(value, key);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const write = process.argv.includes('--write');
  const idArg = process.argv.find((a) => a.startsWith('--patient-id='));
  const onlyPatientId = idArg ? idArg.split('=')[1] : undefined;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set.');

  let cursor: string | undefined;
  let scanned = 0;
  let toEncrypt = 0;
  let updated = 0;
  const perField: Record<Field, number> = {
    numeroRamed: 0,
    numeroAmo: 0,
    allergiesConnues: 0,
    antecedentsPersonnels: 0,
    antecedentsChirurgicaux: 0,
    antecedentsFamiliaux: 0,
  };

  for (;;) {
    const rows = await prisma.patient.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      ...(onlyPatientId ? { where: { id: onlyPatientId } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        organizationId: true,
        ...Object.fromEntries(FIELDS.map((f) => [f, true])),
      },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      const data: Partial<Record<Field, string>> = {};
      for (const field of FIELDS) {
        const value = row[field] as string | null;
        if (!value) continue;
        if (isAlreadyEncrypted(value, key)) continue;
        perField[field]++;
        data[field] = encryptSensitive(value, key);
      }
      const changedFields = Object.keys(data) as Field[];
      if (changedFields.length === 0) continue;
      toEncrypt++;

      if (write) {
        await prisma.patient.update({ where: { id: row.id }, data });
        const verify = await prisma.patient.findUniqueOrThrow({
          where: { id: row.id },
          select: Object.fromEntries(changedFields.map((f) => [f, true])),
        });
        for (const field of changedFields) {
          const original = row[field] as string;
          const roundTripped = decryptSensitive(verify[field] as string, key);
          if (roundTripped !== original) {
            throw new Error(
              `Verification failed for patient ${row.id}, field ${field}: round-trip mismatch. Aborting — no further rows touched.`,
            );
          }
        }
        updated++;
      }
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`Mode: ${write ? 'WRITE' : 'DRY-RUN (no changes made)'}`);
  console.log(`Patients scanned: ${scanned}`);
  console.log(`Patients with at least one plaintext sensitive field: ${toEncrypt}`);
  if (write) console.log(`Patients updated + verified: ${updated}`);
  console.log('Per-field plaintext count found:', perField);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
