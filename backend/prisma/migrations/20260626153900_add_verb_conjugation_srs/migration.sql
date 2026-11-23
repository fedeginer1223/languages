-- AlterTable
ALTER TABLE "verb_conjugations" ADD COLUMN     "lastTrainedAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "recentResults" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "srsLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weightedScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "verb_conjugations_nextReviewAt_idx" ON "verb_conjugations"("nextReviewAt");
