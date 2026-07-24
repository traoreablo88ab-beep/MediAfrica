// One-off backfill for the single-tenant → multi-tenant migration.
// Usage: pnpm db:backfill-multitenancy
//
// Creates one default Organization for all data that predates multi-tenancy,
// makes every existing User an OWNER member of it (nobody loses access —
// everyone had full CRUD before this migration), backfills organizationId on
// Patient/RegisterClosure/ClinicSettings, and seeds one default Plan + an
// ACTIVE Subscription so the admin back-office has real data immediately.
//
// Idempotent: safe to re-run — every step checks for existing rows first.
// Must run BEFORE the enforce_multitenancy_constraints migration (which
// flips these columns to NOT NULL); running it after would already be a
// no-op since there would be nothing left to backfill.

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

const DEFAULT_ORG_SLUG = 'clinique-par-defaut';
const DEFAULT_ORG_NAME = 'CSRéf Bamako V';
const DEFAULT_PLAN_NAME = 'Standard';
const DEFAULT_PLAN_PRICE_XOF = 15000; // FCFA/mois — valeur de départ, éditable ensuite via /admin/plans
const DEFAULT_BILLING_INTERVAL_DAYS = 30;

interface RunDeps {
  prisma?: PrismaClient;
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const organizationId = await prisma.$transaction(async (tx) => {
      let org = await tx.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } });

      if (!org) {
        const owner = await tx.user.findFirst({ orderBy: { createdAt: 'asc' } });
        if (!owner) {
          console.log('No existing users found — nothing to backfill.');
          return null;
        }
        const existingSettings = await tx.clinicSettings.findFirst();
        org = await tx.organization.create({
          data: {
            slug: DEFAULT_ORG_SLUG,
            name: existingSettings?.name ?? DEFAULT_ORG_NAME,
            ownerId: owner.id,
          },
        });
        console.log(`Created default organization "${org.name}" (${org.id}).`);
      } else {
        console.log(`Default organization already exists (${org.id}) — reusing.`);
      }

      // Every pre-existing User becomes an OWNER member — nobody loses
      // access to data they could already fully read/write.
      const users = await tx.user.findMany({ select: { id: true } });
      let membershipsCreated = 0;
      for (const u of users) {
        const existingMembership = await tx.organizationMember.findFirst({
          where: { userId: u.id },
        });
        if (!existingMembership) {
          await tx.organizationMember.create({
            data: { organizationId: org.id, userId: u.id, role: 'OWNER' },
          });
          membershipsCreated += 1;
        }
      }
      console.log(`${membershipsCreated} membership(s) created (of ${users.length} user(s)).`);

      const patientsBackfilled = await tx.patient.updateMany({
        where: { organizationId: null },
        data: { organizationId: org.id },
      });
      console.log(`${patientsBackfilled.count} patient(s) backfilled.`);

      const closuresBackfilled = await tx.registerClosure.updateMany({
        where: { organizationId: null },
        data: { organizationId: org.id },
      });
      console.log(`${closuresBackfilled.count} register closure(s) backfilled.`);

      const orphanSettings = await tx.clinicSettings.findFirst({
        where: { organizationId: null },
      });
      if (orphanSettings) {
        await tx.clinicSettings.update({
          where: { id: orphanSettings.id },
          data: { organizationId: org.id },
        });
        console.log('Existing ClinicSettings row linked to the default organization.');
      } else {
        const alreadyLinked = await tx.clinicSettings.findUnique({
          where: { organizationId: org.id },
        });
        if (!alreadyLinked) {
          await tx.clinicSettings.create({ data: { organizationId: org.id, name: org.name } });
          console.log('Created a new ClinicSettings row for the default organization.');
        }
      }

      let plan = await tx.plan.findFirst({ where: { name: DEFAULT_PLAN_NAME } });
      if (!plan) {
        plan = await tx.plan.create({
          data: {
            name: DEFAULT_PLAN_NAME,
            priceAmount: DEFAULT_PLAN_PRICE_XOF,
            currency: 'XOF',
            billingIntervalDays: DEFAULT_BILLING_INTERVAL_DAYS,
          },
        });
        console.log(`Created default plan "${plan.name}" (${plan.priceAmount} XOF/mois).`);
      }

      const existingSubscription = await tx.subscription.findUnique({
        where: { organizationId: org.id },
      });
      if (!existingSubscription) {
        const currentPeriodEnd = new Date();
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + DEFAULT_BILLING_INTERVAL_DAYS);
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: plan.id,
            status: 'ACTIVE',
            currentPeriodEnd,
          },
        });
        console.log('Created an ACTIVE subscription for the default organization.');
      }

      return org.id;
    });

    if (!organizationId) {
      console.log('Backfill skipped (no data to migrate).');
      return 0;
    }

    console.log(`✓ Backfill complete. Default organization id: ${organizationId}`);
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
