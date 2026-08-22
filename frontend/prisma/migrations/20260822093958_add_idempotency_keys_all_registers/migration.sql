-- AlterTable
ALTER TABLE "Hospitalisation" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Maternite" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Nutrition" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "PlanificationFamiliale" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Vaccination" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Hospitalisation_idempotencyKey_key" ON "Hospitalisation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Maternite_idempotencyKey_key" ON "Maternite"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Nutrition_idempotencyKey_key" ON "Nutrition"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_idempotencyKey_key" ON "Patient"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlanificationFamiliale_idempotencyKey_key" ON "PlanificationFamiliale"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Vaccination_idempotencyKey_key" ON "Vaccination"("idempotencyKey");

