-- AlterTable
ALTER TABLE "languages" ADD COLUMN     "forgetDays" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "sections" TEXT NOT NULL DEFAULT 'vocabulary,verbs,essays';
