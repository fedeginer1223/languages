-- CreateTable
CREATE TABLE "training_session_srs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "srsLevel" INTEGER NOT NULL DEFAULT 0,
    "lastTrainedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_session_srs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_session_srs_sessionId_idx" ON "training_session_srs"("sessionId");

-- CreateIndex
CREATE INDEX "training_session_srs_nextReviewAt_idx" ON "training_session_srs"("nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "training_session_srs_sessionId_wordId_key" ON "training_session_srs"("sessionId", "wordId");

-- AddForeignKey
ALTER TABLE "training_session_srs" ADD CONSTRAINT "training_session_srs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
