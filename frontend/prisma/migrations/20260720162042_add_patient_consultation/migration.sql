-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "dossierNumber" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "sexe" TEXT NOT NULL,
    "telephonePrincipal" TEXT NOT NULL,
    "telephoneSecondaire" TEXT,
    "communeResidence" TEXT NOT NULL,
    "quartierVillage" TEXT,
    "contactUrgenceNom" TEXT,
    "contactUrgenceTelephone" TEXT,
    "numeroRamed" TEXT,
    "groupeSanguin" TEXT,
    "allergiesConnues" TEXT,
    "antecedentsPersonnels" TEXT,
    "antecedentsChirurgicaux" TEXT,
    "antecedentsFamiliaux" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attente',
    "diagnostic" TEXT,
    "traitementPrescrit" TEXT,
    "tensionArterielle" TEXT,
    "poidsKg" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_dossierNumber_key" ON "Patient"("dossierNumber");

-- CreateIndex
CREATE INDEX "Patient_nom_prenom_idx" ON "Patient"("nom", "prenom");

-- CreateIndex
CREATE INDEX "Patient_communeResidence_idx" ON "Patient"("communeResidence");

-- CreateIndex
CREATE INDEX "Patient_createdAt_idx" ON "Patient"("createdAt");

-- CreateIndex
CREATE INDEX "Consultation_patientId_date_idx" ON "Consultation"("patientId", "date");

-- CreateIndex
CREATE INDEX "Consultation_status_date_idx" ON "Consultation"("status", "date");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
