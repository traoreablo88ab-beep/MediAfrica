// Shared helper for register closure (registre de consultation for now —
// registerType leaves room for maternité/PEV/URENI later). Consultation
// mutation routes call isMonthClosed(..., consultation.date) before writing
// and refuse with REGISTER_CLOSED if the month is already closed.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export type ClosureClient = Pick<PrismaClient, 'registerClosure'>;

export function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function isMonthClosed(
  prisma: ClosureClient,
  organizationId: string,
  registerType: string,
  date: Date,
): Promise<boolean> {
  const closure = await prisma.registerClosure.findUnique({
    where: {
      organizationId_registerType_month: { organizationId, registerType, month: monthKey(date) },
    },
    select: { id: true },
  });
  return closure !== null;
}
