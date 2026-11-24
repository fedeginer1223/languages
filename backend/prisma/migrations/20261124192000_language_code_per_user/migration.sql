-- DropIndex
DROP INDEX "languages_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "languages_userId_code_key" ON "languages"("userId", "code");
