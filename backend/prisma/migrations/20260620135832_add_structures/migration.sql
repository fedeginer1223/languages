-- CreateTable
CREATE TABLE "structures" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "hasSlot" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "srsLevel" INTEGER NOT NULL DEFAULT 0,
    "lastTrainedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recentResults" TEXT NOT NULL DEFAULT '',
    "weightedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_examples" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "structure_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_attempts" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "cue" TEXT NOT NULL,
    "userResponse" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "suggestion" TEXT,
    "responseTimeMs" INTEGER NOT NULL,
    "withinLimit" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "structure_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "structures_languageId_idx" ON "structures"("languageId");

-- CreateIndex
CREATE INDEX "structures_nextReviewAt_idx" ON "structures"("nextReviewAt");

-- CreateIndex
CREATE INDEX "structure_examples_structureId_idx" ON "structure_examples"("structureId");

-- CreateIndex
CREATE INDEX "structure_attempts_structureId_idx" ON "structure_attempts"("structureId");

-- CreateIndex
CREATE INDEX "structure_attempts_createdAt_idx" ON "structure_attempts"("createdAt");

-- AddForeignKey
ALTER TABLE "structures" ADD CONSTRAINT "structures_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_examples" ADD CONSTRAINT "structure_examples_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_attempts" ADD CONSTRAINT "structure_attempts_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
