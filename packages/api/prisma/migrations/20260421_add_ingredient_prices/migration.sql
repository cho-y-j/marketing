-- 주재료 가격 히스토리
CREATE TABLE "IngredientPrice" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'retail',
    "date" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngredientPrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IngredientPrice_itemName_priceType_date_key" ON "IngredientPrice"("itemName", "priceType", "date");
CREATE INDEX "IngredientPrice_itemName_date_idx" ON "IngredientPrice"("itemName", "date");

-- 가격 알림
CREATE TABLE "IngredientAlert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "currentPrice" INTEGER NOT NULL,
    "previousPrice" INTEGER NOT NULL,
    "changeRate" DOUBLE PRECISION NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngredientAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IngredientAlert_storeId_createdAt_idx" ON "IngredientAlert"("storeId", "createdAt");
CREATE INDEX "IngredientAlert_storeId_isRead_idx" ON "IngredientAlert"("storeId", "isRead");
