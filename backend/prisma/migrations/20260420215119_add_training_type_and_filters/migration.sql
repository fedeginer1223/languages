-- AlterTable
ALTER TABLE "training_sessions" ADD COLUMN     "minErrorRate" DOUBLE PRECISION,
ADD COLUMN     "topicIds" TEXT,
ADD COLUMN     "trainingType" TEXT NOT NULL DEFAULT 'batch';
