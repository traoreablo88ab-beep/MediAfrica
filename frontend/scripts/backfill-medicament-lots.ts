// One-off backfill for the FEFO lot-tracking addendum to the Dépôt module.
// Usage: pnpm db:backfill-medicament-lots
//
// Every MedicamentProduit with stockActuel > 0 (created before FEFO existed)
// gets one "Stock initial" MedicamentLot with no datePeremption — undated
// lots sort LAST in FEFO order (see depot/fefo.ts's consumeFefo), so this
// legacy stock is simply consumed only after every dated lot is exhausted.
// No stock is lost, no existing DepotMouvementStock row is touched.
//
// Idempotent: skips any product that already has at least one lot (safe to
// re-run, e.g. after receiving real entrées through the FEFO-aware routes).

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

const NUMERO_LOT_STOCK_INITIAL = 'Stock initial';

interface RunDeps {
  prisma?: PrismaClient;
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const produits = await prisma.medicamentProduit.findMany({
      where: { stockActuel: { gt: 0 } },
      select: { id: true, organizationId: true, nom: true, stockActuel: true },
    });

    let created = 0;
    let skipped = 0;
    for (const p of produits) {
      const existingLot = await prisma.medicamentLot.findFirst({ where: { produitId: p.id } });
      if (existingLot) {
        skipped += 1;
        continue;
      }
      await prisma.medicamentLot.create({
        data: {
          organizationId: p.organizationId,
          produitId: p.id,
          numeroLot: NUMERO_LOT_STOCK_INITIAL,
          datePeremption: null,
          quantiteInitiale: p.stockActuel,
          quantiteRestante: p.stockActuel,
        },
      });
      created += 1;
      console.log(`Created "Stock initial" lot for "${p.nom}" (${p.stockActuel} unité(s)).`);
    }

    console.log(
      `✓ Backfill complete. ${created} lot(s) created, ${skipped} product(s) already had one.`,
    );
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
