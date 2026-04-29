-- AlterTable
ALTER TABLE "words" ADD COLUMN     "occurrences" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'vocabulary';

-- CreateIndex
CREATE INDEX "words_source_idx" ON "words"("source");
