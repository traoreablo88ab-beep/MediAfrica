-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "mdo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mdoMaladie" TEXT,
ADD COLUMN     "perimetreBrachialCm" DOUBLE PRECISION,
ADD COLUMN     "statutPT" TEXT,
ADD COLUMN     "tailleCm" DOUBLE PRECISION,
ADD COLUMN     "typeCas" TEXT;

-- CreateTable
CREATE TABLE "RegisterClosure" (
    "id" TEXT NOT NULL,
    "registerType" TEXT NOT NULL DEFAULT 'consultation',
    "month" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisterClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegisterClosure_registerType_month_key" ON "RegisterClosure"("registerType", "month");

-- AddForeignKey
ALTER TABLE "RegisterClosure" ADD CONSTRAINT "RegisterClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
