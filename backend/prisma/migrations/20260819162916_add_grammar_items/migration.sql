-- AlterTable
ALTER TABLE "essays" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'libre';

-- CreateTable
CREATE TABLE "grammar_items" (
    "id" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recentResults" TEXT NOT NULL DEFAULT '',
    "weightedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_grammar_requests" (
    "id" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "grammarItemId" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "snippet" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_grammar_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grammar_items_languageId_idx" ON "grammar_items"("languageId");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_items_languageId_title_key" ON "grammar_items"("languageId", "title");

-- CreateIndex
CREATE INDEX "essay_grammar_requests_essayId_idx" ON "essay_grammar_requests"("essayId");

-- CreateIndex
CREATE INDEX "essay_grammar_requests_grammarItemId_idx" ON "essay_grammar_requests"("grammarItemId");

-- CreateIndex
CREATE UNIQUE INDEX "essay_grammar_requests_essayId_grammarItemId_key" ON "essay_grammar_requests"("essayId", "grammarItemId");

-- AddForeignKey
ALTER TABLE "grammar_items" ADD CONSTRAINT "grammar_items_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_grammar_requests" ADD CONSTRAINT "essay_grammar_requests_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_grammar_requests" ADD CONSTRAINT "essay_grammar_requests_grammarItemId_fkey" FOREIGN KEY ("grammarItemId") REFERENCES "grammar_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
