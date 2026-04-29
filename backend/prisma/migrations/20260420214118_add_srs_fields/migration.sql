-- AlterTable
ALTER TABLE "words" ADD COLUMN     "lastTrainedAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "srsLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "words_nextReviewAt_idx" ON "words"("nextReviewAt");
