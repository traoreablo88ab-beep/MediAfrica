-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "adminRespondedAt" TIMESTAMP(3),
ADD COLUMN     "adminResponse" TEXT,
ADD COLUMN     "rating" INTEGER;
