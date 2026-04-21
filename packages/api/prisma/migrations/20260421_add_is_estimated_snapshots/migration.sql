-- Add isEstimated flag to distinguish backfill estimates from real observations
ALTER TABLE "StoreDailySnapshot" ADD COLUMN "isEstimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompetitorDailySnapshot" ADD COLUMN "isEstimated" BOOLEAN NOT NULL DEFAULT false;
