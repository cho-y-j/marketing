-- CreateTable
CREATE TABLE "BlogMention" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "blogger" TEXT,
    "snippet" TEXT,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogMention_storeId_postedAt_idx" ON "BlogMention"("storeId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlogMention_storeId_url_key" ON "BlogMention"("storeId", "url");
