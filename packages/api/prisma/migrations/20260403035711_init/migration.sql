-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CompetitorType" AS ENUM ('AUTO', 'USER_SET', 'CROSS_INDUSTRY');

-- CreateEnum
CREATE TYPE "KeywordType" AS ENUM ('MAIN', 'AI_RECOMMENDED', 'HIDDEN', 'SEASONAL', 'USER_ADDED');

-- CreateEnum
CREATE TYPE "TrendDirection" AS ENUM ('UP', 'DOWN', 'STABLE');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('PLACE_POST', 'REVIEW_REPLY', 'SNS_POST', 'BLOG_POST');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "provider" TEXT,
    "providerId" TEXT,
    "profileImage" TEXT,
    "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "subscriptionEndAt" TIMESTAMP(3),
    "anthropicApiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "naverPlaceId" TEXT,
    "naverPlaceUrl" TEXT,
    "category" TEXT,
    "subCategory" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "district" TEXT,
    "competitiveScore" DOUBLE PRECISION,
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAnalysis" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "receiptReviewCount" INTEGER,
    "blogReviewCount" INTEGER,
    "dailySearchVolume" INTEGER,
    "saveCount" INTEGER,
    "visitorCount" INTEGER,
    "n1Score" DOUBLE PRECISION,
    "n2Score" DOUBLE PRECISION,
    "n3Score" DOUBLE PRECISION,
    "aiAnalysis" JSONB,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "recommendations" JSONB,
    "competitiveScore" DOUBLE PRECISION,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "competitorPlaceId" TEXT,
    "competitorUrl" TEXT,
    "category" TEXT,
    "type" "CompetitorType" NOT NULL DEFAULT 'AUTO',
    "receiptReviewCount" INTEGER,
    "blogReviewCount" INTEGER,
    "dailySearchVolume" INTEGER,
    "lastComparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreKeyword" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "monthlySearchVolume" INTEGER,
    "competitorCount" INTEGER,
    "currentRank" INTEGER,
    "previousRank" INTEGER,
    "type" "KeywordType" NOT NULL DEFAULT 'AI_RECOMMENDED',
    "trendDirection" "TrendDirection",
    "trendPercentage" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "trends" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "competitorAlert" JSONB,
    "seasonalInfo" JSONB,
    "aiModel" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedContent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "keywords" TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "keywords" TEXT[],
    "description" TEXT,

    CONSTRAINT "SeasonalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Store_naverPlaceId_key" ON "Store"("naverPlaceId");

-- CreateIndex
CREATE INDEX "Store_userId_idx" ON "Store"("userId");

-- CreateIndex
CREATE INDEX "Store_district_category_idx" ON "Store"("district", "category");

-- CreateIndex
CREATE INDEX "StoreAnalysis_storeId_analyzedAt_idx" ON "StoreAnalysis"("storeId", "analyzedAt");

-- CreateIndex
CREATE INDEX "Competitor_storeId_idx" ON "Competitor"("storeId");

-- CreateIndex
CREATE INDEX "StoreKeyword_storeId_idx" ON "StoreKeyword"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreKeyword_storeId_keyword_key" ON "StoreKeyword"("storeId", "keyword");

-- CreateIndex
CREATE INDEX "DailyBriefing_storeId_date_idx" ON "DailyBriefing"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_storeId_date_key" ON "DailyBriefing"("storeId", "date");

-- CreateIndex
CREATE INDEX "GeneratedContent_storeId_type_idx" ON "GeneratedContent"("storeId", "type");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "SeasonalEvent_startDate_endDate_idx" ON "SeasonalEvent"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "SeasonalEvent_region_idx" ON "SeasonalEvent"("region");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAnalysis" ADD CONSTRAINT "StoreAnalysis_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreKeyword" ADD CONSTRAINT "StoreKeyword_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
