-- AlterTable
ALTER TABLE "Vaccination" ADD COLUMN     "conseilsAme" TEXT,
ADD COLUMN     "dejaSousContraception" BOOLEAN,
ADD COLUMN     "methodeContraceptivePrecedente" TEXT,
ADD COLUMN     "methodePfAdoptee" TEXT,
ADD COLUMN     "pfppCounselingPropose" BOOLEAN,
ADD COLUMN     "pratiqueAme" TEXT;
