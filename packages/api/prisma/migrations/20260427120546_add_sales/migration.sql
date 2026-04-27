-- CreateTable
CREATE TABLE "Sales" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "cardAmount" INTEGER,
    "cashAmount" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "receiptText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sales_storeId_date_idx" ON "Sales"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Sales_storeId_date_key" ON "Sales"("storeId", "date");
