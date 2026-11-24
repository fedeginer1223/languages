-- AlterTable (nullable first so existing rows can be backfilled)
ALTER TABLE "languages" ADD COLUMN     "userId" TEXT;

-- Backfill: existing languages belong to the oldest user
UPDATE "languages" SET "userId" = (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;

ALTER TABLE "languages" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "languages_userId_idx" ON "languages"("userId");

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
