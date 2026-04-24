-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('EXPOSURE', 'DIRECT', 'BOTH');

-- AlterTable
ALTER TABLE "Competitor" ADD COLUMN     "competitionType" "CompetitionType" NOT NULL DEFAULT 'DIRECT';

-- CreateIndex
CREATE INDEX "Competitor_storeId_competitionType_idx" ON "Competitor"("storeId", "competitionType");
