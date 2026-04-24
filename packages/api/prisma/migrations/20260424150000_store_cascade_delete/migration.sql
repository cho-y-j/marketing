-- DropForeignKey
ALTER TABLE "Competitor" DROP CONSTRAINT "Competitor_storeId_fkey";

-- DropForeignKey
ALTER TABLE "DailyBriefing" DROP CONSTRAINT "DailyBriefing_storeId_fkey";

-- DropForeignKey
ALTER TABLE "FranchiseMembership" DROP CONSTRAINT "FranchiseMembership_storeId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedContent" DROP CONSTRAINT "GeneratedContent_storeId_fkey";

-- DropForeignKey
ALTER TABLE "KeywordRankHistory" DROP CONSTRAINT "KeywordRankHistory_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreAnalysis" DROP CONSTRAINT "StoreAnalysis_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreKeyword" DROP CONSTRAINT "StoreKeyword_storeId_fkey";

-- AddForeignKey
ALTER TABLE "FranchiseMembership" ADD CONSTRAINT "FranchiseMembership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAnalysis" ADD CONSTRAINT "StoreAnalysis_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreKeyword" ADD CONSTRAINT "StoreKeyword_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordRankHistory" ADD CONSTRAINT "KeywordRankHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

