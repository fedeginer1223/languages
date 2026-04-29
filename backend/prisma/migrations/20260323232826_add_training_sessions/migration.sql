-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "topicId" TEXT,
    "totalQuestions" INTEGER NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_session_questions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "correct" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_sessions_languageId_idx" ON "training_sessions"("languageId");

-- CreateIndex
CREATE INDEX "training_sessions_completed_idx" ON "training_sessions"("completed");

-- CreateIndex
CREATE INDEX "training_session_questions_sessionId_idx" ON "training_session_questions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "training_session_questions_sessionId_order_key" ON "training_session_questions"("sessionId", "order");

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session_questions" ADD CONSTRAINT "training_session_questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
