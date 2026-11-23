-- AlterTable
ALTER TABLE "words" ADD COLUMN     "dictationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dictationCorrectCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dictationLastTrainedAt" TIMESTAMP(3),
ADD COLUMN     "dictationNextReviewAt" TIMESTAMP(3),
ADD COLUMN     "dictationRecentResults" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dictationSrsLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dictationWeightedScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "words_dictationNextReviewAt_idx" ON "words"("dictationNextReviewAt");
