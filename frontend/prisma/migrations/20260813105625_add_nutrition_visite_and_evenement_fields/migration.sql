-- AlterTable
ALTER TABLE "Nutrition" ADD COLUMN     "allaite" BOOLEAN,
ADD COLUMN     "carteVaccination" BOOLEAN,
ADD COLUMN     "jumeaux" BOOLEAN,
ADD COLUMN     "nomMere" TEXT,
ADD COLUMN     "nomPere" TEXT,
ADD COLUMN     "parentsVivants" BOOLEAN,
ADD COLUMN     "sourceAdmission" TEXT,
ADD COLUMN     "vaccinationAJour" BOOLEAN;

-- AlterTable
ALTER TABLE "NutritionVisiteSuivi" ADD COLUMN     "alerteLethargique" TEXT,
ADD COLUMN     "atpeSachets" INTEGER,
ADD COLUMN     "dermatoses" TEXT,
ADD COLUMN     "diarrheeJours" INTEGER,
ADD COLUMN     "fievreJours" INTEGER,
ADD COLUMN     "frequenceRespiratoireMin" INTEGER,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "resultatTestPalu" TEXT,
ADD COLUMN     "seancesEducationNutritionnelle" INTEGER,
ADD COLUMN     "seancesStimulation" INTEGER,
ADD COLUMN     "temperatureC" DOUBLE PRECISION,
ADD COLUMN     "testAppetit" TEXT,
ADD COLUMN     "touxJours" INTEGER,
ADD COLUMN     "vomissementJours" INTEGER;

-- CreateTable
CREATE TABLE "NutritionEvenement" (
    "id" TEXT NOT NULL,
    "nutritionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raison" TEXT,
    "conclusion" TEXT,
    "centre" TEXT,
    "resultat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionEvenement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionEvenement_nutritionId_date_idx" ON "NutritionEvenement"("nutritionId", "date");

-- AddForeignKey
ALTER TABLE "NutritionEvenement" ADD CONSTRAINT "NutritionEvenement_nutritionId_fkey" FOREIGN KEY ("nutritionId") REFERENCES "Nutrition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
