-- CreateTable
CREATE TABLE "book_bookmarks" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_bookmarks_bookId_pageIndex_key" ON "book_bookmarks"("bookId", "pageIndex");

-- AddForeignKey
ALTER TABLE "book_bookmarks" ADD CONSTRAINT "book_bookmarks_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
