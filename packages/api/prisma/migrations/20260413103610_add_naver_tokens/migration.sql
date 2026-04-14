-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "actionRate" DOUBLE PRECISION,
ADD COLUMN     "avgOrderValue" INTEGER,
ADD COLUMN     "marketingGrade" TEXT NOT NULL DEFAULT 'BRONZE',
ADD COLUMN     "setupCompletedAt" TIMESTAMP(3),
ADD COLUMN     "setupError" TEXT,
ADD COLUMN     "setupStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "setupStep" TEXT,
ADD COLUMN     "smartPlaceBizId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "naverAccessToken" TEXT,
ADD COLUMN     "naverConnectedAt" TIMESTAMP(3),
ADD COLUMN     "naverRefreshToken" TEXT,
ADD COLUMN     "naverTokenExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAutoSettings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "autoReviewReply" BOOLEAN NOT NULL DEFAULT false,
    "autoContentPublish" BOOLEAN NOT NULL DEFAULT false,
    "contentPublishPerWeek" INTEGER NOT NULL DEFAULT 2,
    "autoSeasonalKeyword" BOOLEAN NOT NULL DEFAULT true,
    "autoHiddenKeyword" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StoreAutoSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "relatedKeywords" TEXT[],
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectMeasuredAt" TIMESTAMP(3),
    "rankBefore" JSONB,
    "rankAfter" JSONB,
    "effectSummary" TEXT,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorAlert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "aiRecommendation" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingAction_storeId_status_idx" ON "PendingAction"("storeId", "status");

-- CreateIndex
CREATE INDEX "PendingAction_storeId_createdAt_idx" ON "PendingAction"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreAutoSettings_storeId_key" ON "StoreAutoSettings"("storeId");

-- CreateIndex
CREATE INDEX "StoreAutoSettings_storeId_idx" ON "StoreAutoSettings"("storeId");

-- CreateIndex
CREATE INDEX "ActionLog_storeId_executedAt_idx" ON "ActionLog"("storeId", "executedAt");

-- CreateIndex
CREATE INDEX "CompetitorAlert_storeId_createdAt_idx" ON "CompetitorAlert"("storeId", "createdAt");
