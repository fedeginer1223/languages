-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "languageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verbs" (
    "id" TEXT NOT NULL,
    "infinitive" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verbs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verb_conjugations" (
    "id" TEXT NOT NULL,
    "verbId" TEXT NOT NULL,
    "tense" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verb_conjugations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essays" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "originalText" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_corrections" (
    "id" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "correctedText" TEXT NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errors" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "corrected" TEXT NOT NULL,
    "explanation" TEXT,
    "position" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "convertedToWord" BOOLEAN NOT NULL DEFAULT false,
    "wordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE INDEX "topics_languageId_idx" ON "topics"("languageId");

-- CreateIndex
CREATE INDEX "words_topicId_idx" ON "words"("topicId");

-- CreateIndex
CREATE INDEX "words_successRate_idx" ON "words"("successRate");

-- CreateIndex
CREATE INDEX "verbs_languageId_idx" ON "verbs"("languageId");

-- CreateIndex
CREATE INDEX "verb_conjugations_verbId_idx" ON "verb_conjugations"("verbId");

-- CreateIndex
CREATE UNIQUE INDEX "verb_conjugations_verbId_tense_person_key" ON "verb_conjugations"("verbId", "tense", "person");

-- CreateIndex
CREATE INDEX "essays_languageId_idx" ON "essays"("languageId");

-- CreateIndex
CREATE INDEX "essay_corrections_essayId_idx" ON "essay_corrections"("essayId");

-- CreateIndex
CREATE INDEX "errors_correctionId_idx" ON "errors"("correctionId");

-- CreateIndex
CREATE INDEX "errors_errorType_idx" ON "errors"("errorType");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "words" ADD CONSTRAINT "words_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verbs" ADD CONSTRAINT "verbs_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verb_conjugations" ADD CONSTRAINT "verb_conjugations_verbId_fkey" FOREIGN KEY ("verbId") REFERENCES "verbs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essays" ADD CONSTRAINT "essays_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_corrections" ADD CONSTRAINT "essay_corrections_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errors" ADD CONSTRAINT "errors_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "essay_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
