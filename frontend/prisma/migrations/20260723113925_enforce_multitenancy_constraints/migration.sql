-- DropIndex
DROP INDEX "OrganizationMember_userId_idx";

-- DropIndex
DROP INDEX "RegisterClosure_organizationId_idx";

-- DropIndex
DROP INDEX "RegisterClosure_registerType_month_key";

-- AlterTable
ALTER TABLE "ClinicSettings" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "RegisterClosure" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_key" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RegisterClosure_organizationId_registerType_month_key" ON "RegisterClosure"("organizationId", "registerType", "month");

