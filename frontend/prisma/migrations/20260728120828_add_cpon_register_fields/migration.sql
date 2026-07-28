-- AlterTable
ALTER TABLE "Maternite" ADD COLUMN     "cponTypeCas" TEXT,
ADD COLUMN     "dateAccouchementCpon" TIMESTAMP(3),
ADD COLUMN     "etatCol" TEXT,
ADD COLUMN     "etatConjonctives" TEXT,
ADD COLUMN     "etatLochies" TEXT,
ADD COLUMN     "etatSeins" TEXT,
ADD COLUMN     "involutionUterine" TEXT,
ADD COLUMN     "profession" TEXT;
