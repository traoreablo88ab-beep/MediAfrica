-- CreateTable
CREATE TABLE "Nutrition" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typeCas" TEXT,
    "poidsKg" DOUBLE PRECISION,
    "tailleCm" DOUBLE PRECISION,
    "perimetreBrachialCm" DOUBLE PRECISION,
    "oedemes" TEXT,
    "statutPT" TEXT,
    "classification" TEXT,
    "testAppetit" TEXT,
    "complicationsMedicales" TEXT,
    "priseEnCharge" TEXT,
    "atpe" BOOLEAN,
    "laitF75" BOOLEAN,
    "laitF100" BOOLEAN,
    "amoxicilline" BOOLEAN,
    "vitamineA" BOOLEAN,
    "deparasitant" BOOLEAN,
    "traitementAutre" TEXT,
    "numeroVisiteSuivi" INTEGER,
    "evolution" TEXT,
    "prochainRdv" TIMESTAMP(3),
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nutrition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Nutrition_patientId_date_idx" ON "Nutrition"("patientId", "date");

-- AddForeignKey
ALTER TABLE "Nutrition" ADD CONSTRAINT "Nutrition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nutrition" ADD CONSTRAINT "Nutrition_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
