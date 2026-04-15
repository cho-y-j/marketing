-- CreateTable
CREATE TABLE "StoreDailySnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visitorReviewCount" INTEGER,
    "blogReviewCount" INTEGER,
    "visitorDelta" INTEGER,
    "blogDelta" INTEGER,
    "raw" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorDailySnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "competitorPlaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visitorReviewCount" INTEGER,
    "blogReviewCount" INTEGER,
    "visitorDelta" INTEGER,
    "blogDelta" INTEGER,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordDailyVolume" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pcVolume" INTEGER,
    "mobileVolume" INTEGER,
    "totalVolume" INTEGER,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordDailyVolume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcludedKeyword" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "reason" TEXT,
    "excludedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcludedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreDailySnapshot_storeId_date_idx" ON "StoreDailySnapshot"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StoreDailySnapshot_storeId_date_key" ON "StoreDailySnapshot"("storeId", "date");

-- CreateIndex
CREATE INDEX "CompetitorDailySnapshot_storeId_date_idx" ON "CompetitorDailySnapshot"("storeId", "date");

-- CreateIndex
CREATE INDEX "CompetitorDailySnapshot_competitorPlaceId_date_idx" ON "CompetitorDailySnapshot"("competitorPlaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorDailySnapshot_storeId_competitorPlaceId_date_key" ON "CompetitorDailySnapshot"("storeId", "competitorPlaceId", "date");

-- CreateIndex
CREATE INDEX "KeywordDailyVolume_keyword_date_idx" ON "KeywordDailyVolume"("keyword", "date");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordDailyVolume_keyword_date_key" ON "KeywordDailyVolume"("keyword", "date");

-- CreateIndex
CREATE INDEX "ExcludedKeyword_storeId_idx" ON "ExcludedKeyword"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExcludedKeyword_storeId_keyword_key" ON "ExcludedKeyword"("storeId", "keyword");
