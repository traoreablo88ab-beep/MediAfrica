-- CreateTable
CREATE TABLE "Hospitalisation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT,
    "dateHeureEntree" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motifAdmission" TEXT NOT NULL,
    "service" TEXT,
    "diagnosticPrincipal" TEXT,
    "diagnosticsSecondaires" TEXT,
    "traitementRecu" TEXT,
    "dateHeureSortie" TIMESTAMP(3),
    "issue" TEXT,
    "causeDeces" TEXT,
    "structureReference" TEXT,
    "praticienResponsable" TEXT,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospitalisation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hospitalisation_patientId_dateHeureEntree_idx" ON "Hospitalisation"("patientId", "dateHeureEntree");

-- AddForeignKey
ALTER TABLE "Hospitalisation" ADD CONSTRAINT "Hospitalisation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalisation" ADD CONSTRAINT "Hospitalisation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
