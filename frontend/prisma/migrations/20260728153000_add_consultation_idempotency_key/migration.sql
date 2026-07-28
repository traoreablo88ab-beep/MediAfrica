-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "idempotencyBodyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_idempotencyKey_key" ON "Consultation"("idempotencyKey");
