-- CreateTable
CREATE TABLE "LepreRapport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "nbMaladesTraitementDebutPeriode" INTEGER,
    "nbMaladesTraitementDebutPeriodePB" INTEGER,
    "nbMaladesTraitementDebutPeriodeMB" INTEGER,
    "nbNouveauxCasPrisEnCharge" INTEGER,
    "nbNouveauxCasPB" INTEGER,
    "nbNouveauxCasMB" INTEGER,
    "nbNouveauxCasEnfantsMoins15Ans" INTEGER,
    "nbMutilationNouveauxCasPB" INTEGER,
    "nbMutilationNouveauxCasMB" INTEGER,
    "nbAutresCasRecusPB" INTEGER,
    "nbAutresCasRecusMB" INTEGER,
    "nbTraitementsArretes" INTEGER,
    "nbGuerisonPB" INTEGER,
    "nbGuerisonMB" INTEGER,
    "nbDecesPB" INTEGER,
    "nbDecesMB" INTEGER,
    "nbTransfertAutreFormationPB" INTEGER,
    "nbTransfertAutreFormationMB" INTEGER,
    "nbPerdusDeVuePB" INTEGER,
    "nbPerdusDeVueMB" INTEGER,
    "nbMaladesFinPeriode" INTEGER,
    "nbMaladesFinPeriodePB" INTEGER,
    "nbMaladesFinPeriodeMB" INTEGER,
    "nbNouvellesInfirmitesDurantTraitement" INTEGER,
    "nbNouveauCasInfirmiteDegre2" INTEGER,
    "nbJoursRuptureMedicamentsPB" INTEGER,
    "nbJoursRuptureMedicamentsMB" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LepreRapport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LepreRapport_organizationId_month_key" ON "LepreRapport"("organizationId", "month");

-- AddForeignKey
ALTER TABLE "LepreRapport" ADD CONSTRAINT "LepreRapport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LepreRapport" ADD CONSTRAINT "LepreRapport_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
