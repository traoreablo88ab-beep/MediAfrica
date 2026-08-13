-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "indigent" BOOLEAN,
ADD COLUMN     "localisationPrecise" TEXT,
ADD COLUMN     "telephoneContact" TEXT;

-- AlterTable
ALTER TABLE "Maternite" ADD COLUMN     "indigent" BOOLEAN,
ADD COLUMN     "localisationPrecise" TEXT,
ADD COLUMN     "telephoneContact" TEXT;
