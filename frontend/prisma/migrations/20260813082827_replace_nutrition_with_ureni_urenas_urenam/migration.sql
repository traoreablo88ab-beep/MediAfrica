/*
  Warnings:

  - You are about to drop the column `amoxicilline` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `atpe` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `classification` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `complicationsMedicales` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `deparasitant` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `evolution` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `laitF100` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `laitF75` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `numeroVisiteSuivi` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `priseEnCharge` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `prochainRdv` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `statutPT` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `testAppetit` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `traitementAutre` on the `Nutrition` table. All the data in the column will be lost.
  - You are about to drop the column `vitamineA` on the `Nutrition` table. All the data in the column will be lost.
  - Added the required column `type` to the `Nutrition` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Nutrition" DROP COLUMN "amoxicilline",
DROP COLUMN "atpe",
DROP COLUMN "classification",
DROP COLUMN "complicationsMedicales",
DROP COLUMN "deparasitant",
DROP COLUMN "evolution",
DROP COLUMN "laitF100",
DROP COLUMN "laitF75",
DROP COLUMN "numeroVisiteSuivi",
DROP COLUMN "priseEnCharge",
DROP COLUMN "prochainRdv",
DROP COLUMN "statutPT",
DROP COLUMN "testAppetit",
DROP COLUMN "traitementAutre",
DROP COLUMN "vitamineA",
ADD COLUMN     "ageMois" INTEGER,
ADD COLUMN     "beneficiairePlaquette" BOOLEAN,
ADD COLUMN     "beneficiairePoudreNutritive" BOOLEAN,
ADD COLUMN     "datePoidsMinimum" TIMESTAMP(3),
ADD COLUMN     "dateSortie" TIMESTAMP(3),
ADD COLUMN     "dureeSejourJours" INTEGER,
ADD COLUMN     "localisationPrecise" TEXT,
ADD COLUMN     "modeAdmission" TEXT,
ADD COLUMN     "numeroMas" TEXT,
ADD COLUMN     "oedemeSortie" TEXT,
ADD COLUMN     "pathologiesAssociees" TEXT,
ADD COLUMN     "perimetreBrachialSortieCm" DOUBLE PRECISION,
ADD COLUMN     "poidsMinimumKg" DOUBLE PRECISION,
ADD COLUMN     "poidsSortieKg" DOUBLE PRECISION,
ADD COLUMN     "ptIndice" TEXT,
ADD COLUMN     "ptIndiceSortie" TEXT,
ADD COLUMN     "seancesCcsc" INTEGER,
ADD COLUMN     "seancesStimulationPsychocognitive" INTEGER,
ADD COLUMN     "tailleSortieCm" DOUBLE PRECISION,
ADD COLUMN     "telephoneContact" TEXT,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "typeSortie" TEXT;

-- CreateTable
CREATE TABLE "NutritionVisiteSuivi" (
    "id" TEXT NOT NULL,
    "nutritionId" TEXT NOT NULL,
    "numeroVisite" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poidsKg" DOUBLE PRECISION,
    "tailleCm" DOUBLE PRECISION,
    "perimetreBrachialCm" DOUBLE PRECISION,
    "ptIndice" TEXT,
    "oedemes" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionVisiteSuivi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionVisiteSuivi_nutritionId_numeroVisite_key" ON "NutritionVisiteSuivi"("nutritionId", "numeroVisite");

-- CreateIndex
CREATE INDEX "Nutrition_type_date_idx" ON "Nutrition"("type", "date");

-- AddForeignKey
ALTER TABLE "NutritionVisiteSuivi" ADD CONSTRAINT "NutritionVisiteSuivi_nutritionId_fkey" FOREIGN KEY ("nutritionId") REFERENCES "Nutrition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
