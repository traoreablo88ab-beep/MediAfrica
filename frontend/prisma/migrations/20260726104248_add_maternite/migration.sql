-- CreateTable
CREATE TABLE "Maternite" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "gestite" INTEGER,
    "parite" INTEGER,
    "dpa" TIMESTAMP(3),
    "ddr" TIMESTAMP(3),
    "observations" TEXT,
    "cpnNumeroVisite" INTEGER,
    "ageGestationnelSemaines" INTEGER,
    "poidsKg" DOUBLE PRECISION,
    "tensionArterielle" TEXT,
    "hauteurUterineCm" DOUBLE PRECISION,
    "bruitsCoeurFoetal" TEXT,
    "mouvementsFoetaux" TEXT,
    "oedemes" BOOLEAN,
    "tpiDose" INTEGER,
    "moustiquaireImpregnee" BOOLEAN,
    "vatDose" INTEGER,
    "ferAcideFolique" BOOLEAN,
    "albuminurie" TEXT,
    "glycosurie" TEXT,
    "vih" TEXT,
    "prochainRdv" TIMESTAMP(3),
    "modeAccouchement" TEXT,
    "dureeTravailHeures" DOUBLE PRECISION,
    "assistePar" TEXT,
    "issueGrossesse" TEXT,
    "sexeNouveauNe" TEXT,
    "poidsNaissanceG" DOUBLE PRECISION,
    "apgar1min" INTEGER,
    "apgar5min" INTEGER,
    "perimetreCranienCm" DOUBLE PRECISION,
    "reanimationNouveauNe" BOOLEAN,
    "complicationsAccouchement" TEXT,
    "episiotomie" BOOLEAN,
    "placentaComplet" BOOLEAN,
    "cponNumeroVisite" INTEGER,
    "joursPostPartum" INTEGER,
    "etatPerinee" TEXT,
    "allaitement" TEXT,
    "planificationFamiliale" TEXT,
    "etatNouveauNeCpon" TEXT,
    "vaccinationBcgFait" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Maternite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Maternite_patientId_date_idx" ON "Maternite"("patientId", "date");

-- CreateIndex
CREATE INDEX "Maternite_type_date_idx" ON "Maternite"("type", "date");

-- AddForeignKey
ALTER TABLE "Maternite" ADD CONSTRAINT "Maternite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maternite" ADD CONSTRAINT "Maternite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
