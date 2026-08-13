-- CreateTable
CREATE TABLE "PlanificationFamiliale" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typeVisite" TEXT NOT NULL,
    "methodeChoisie" TEXT NOT NULL,
    "methodePrecedente" TEXT,
    "parite" INTEGER,
    "gestite" INTEGER,
    "tensionArterielle" TEXT,
    "poidsKg" DOUBLE PRECISION,
    "counselingDonne" BOOLEAN,
    "effetsSecondairesRapportes" TEXT,
    "quantiteRemise" TEXT,
    "prochainRdv" TIMESTAMP(3),
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanificationFamiliale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanificationFamiliale_patientId_date_idx" ON "PlanificationFamiliale"("patientId", "date");

-- AddForeignKey
ALTER TABLE "PlanificationFamiliale" ADD CONSTRAINT "PlanificationFamiliale_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanificationFamiliale" ADD CONSTRAINT "PlanificationFamiliale_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
