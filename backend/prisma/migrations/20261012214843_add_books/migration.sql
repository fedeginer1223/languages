-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "error" TEXT,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "totalWords" INTEGER NOT NULL DEFAULT 0,
    "lastPageIndex" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_pages" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "chapterTitle" TEXT,
    "text" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "annotations" JSONB,
    "annotatedAt" TIMESTAMP(3),
    "annotating" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "book_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_summaries" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "fromIndex" INTEGER NOT NULL,
    "toIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "annotations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_saved_words" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_saved_words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "books_languageId_idx" ON "books"("languageId");

-- CreateIndex
CREATE UNIQUE INDEX "book_pages_bookId_index_key" ON "book_pages"("bookId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "book_summaries_bookId_fromIndex_toIndex_key" ON "book_summaries"("bookId", "fromIndex", "toIndex");

-- CreateIndex
CREATE UNIQUE INDEX "book_saved_words_bookId_lemma_key" ON "book_saved_words"("bookId", "lemma");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_pages" ADD CONSTRAINT "book_pages_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_summaries" ADD CONSTRAINT "book_summaries_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_saved_words" ADD CONSTRAINT "book_saved_words_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_saved_words" ADD CONSTRAINT "book_saved_words_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
