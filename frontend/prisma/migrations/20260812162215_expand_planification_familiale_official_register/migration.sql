-- AlterTable
ALTER TABLE "PlanificationFamiliale" ADD COLUMN     "actionMethode" TEXT,
ADD COLUMN     "ageDernierEnfantMois" INTEGER,
ADD COLUMN     "conseilsAlimentationComplement" TEXT,
ADD COLUMN     "enfantAJourVaccins" TEXT,
ADD COLUMN     "nbreCyclesDistribues" INTEGER,
ADD COLUMN     "ppi" BOOLEAN,
ADD COLUMN     "pratiqueAme" TEXT,
ADD COLUMN     "serviceProvenance" TEXT,
ADD COLUMN     "typeUtilisateur" TEXT;
