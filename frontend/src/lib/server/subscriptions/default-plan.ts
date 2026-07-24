// The plan a brand-new clinic's TRIALING subscription starts on. Cheapest
// active plan, so a fresh signup never silently lands on a premium tier.
import 'server-only';
import type { Prisma } from '@prisma/client';

export async function getDefaultPlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({
    where: { isActive: true },
    orderBy: { priceAmount: 'asc' },
  });
}
