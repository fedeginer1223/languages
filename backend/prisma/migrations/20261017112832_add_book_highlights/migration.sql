-- CreateTable
CREATE TABLE "book_highlights" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "startToken" INTEGER NOT NULL,
    "endToken" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "book_highlights_bookId_pageIndex_idx" ON "book_highlights"("bookId", "pageIndex");

-- AddForeignKey
ALTER TABLE "book_highlights" ADD CONSTRAINT "book_highlights_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
