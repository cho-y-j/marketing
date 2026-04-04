-- CreateTable
CREATE TABLE "KeywordRankHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "rank" INTEGER,
    "totalResults" INTEGER,
    "topPlaces" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordRankHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorHistory" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "receiptReviewCount" INTEGER,
    "blogReviewCount" INTEGER,
    "saveCount" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordRankHistory_storeId_keyword_checkedAt_idx" ON "KeywordRankHistory"("storeId", "keyword", "checkedAt");

-- CreateIndex
CREATE INDEX "KeywordRankHistory_storeId_checkedAt_idx" ON "KeywordRankHistory"("storeId", "checkedAt");

-- CreateIndex
CREATE INDEX "CompetitorHistory_competitorId_recordedAt_idx" ON "CompetitorHistory"("competitorId", "recordedAt");

-- AddForeignKey
ALTER TABLE "KeywordRankHistory" ADD CONSTRAINT "KeywordRankHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorHistory" ADD CONSTRAINT "CompetitorHistory_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
