-- CreateTable
CREATE TABLE "KeywordVolumeHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "keyword" TEXT NOT NULL,
    "monthlyVolume" INTEGER NOT NULL,
    "pcVolume" INTEGER,
    "mobileVolume" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'searchad',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordVolumeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "endpoint" TEXT,
    "token" TEXT,
    "keys" JSONB,
    "userAgent" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreReview" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "authorName" TEXT,
    "rating" INTEGER,
    "body" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replyStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "draftReply" TEXT,
    "finalReply" TEXT,
    "draftedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "StoreReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordVolumeHistory_keyword_recordedAt_idx" ON "KeywordVolumeHistory"("keyword", "recordedAt");

-- CreateIndex
CREATE INDEX "KeywordVolumeHistory_storeId_keyword_recordedAt_idx" ON "KeywordVolumeHistory"("storeId", "keyword", "recordedAt");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_enabled_idx" ON "PushSubscription"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE INDEX "StoreReview_storeId_replyStatus_idx" ON "StoreReview"("storeId", "replyStatus");

-- CreateIndex
CREATE INDEX "StoreReview_storeId_postedAt_idx" ON "StoreReview"("storeId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreReview_source_externalId_key" ON "StoreReview"("source", "externalId");
