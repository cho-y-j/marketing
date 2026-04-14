-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('INDIVIDUAL', 'FRANCHISE', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- AlterTable
ALTER TABLE "StoreAnalysis" DROP COLUMN "n1Score",
DROP COLUMN "n2Score",
DROP COLUMN "n3Score",
ADD COLUMN     "engagementScore" DOUBLE PRECISION,
ADD COLUMN     "satisfactionScore" DOUBLE PRECISION,
ADD COLUMN     "trafficScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "businessNumber" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendReason" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FranchiseGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseMembership" (
    "id" TEXT NOT NULL,
    "franchiseGroupId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FranchiseMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordRule" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "subCategory" TEXT,
    "pattern" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogAnalysis" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "blogExposureCount" INTEGER,
    "recentBlogRate" DOUBLE PRECISION,
    "competitorMentionCount" INTEGER,
    "hasPlaceLink" BOOLEAN,
    "competitionLevel" TEXT,
    "topBlogs" JSONB,
    "recommendation" TEXT,
    "recommendationReason" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseGroup_ownerId_key" ON "FranchiseGroup"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseMembership_storeId_key" ON "FranchiseMembership"("storeId");

-- CreateIndex
CREATE INDEX "FranchiseMembership_franchiseGroupId_idx" ON "FranchiseMembership"("franchiseGroupId");

-- CreateIndex
CREATE INDEX "KeywordRule_industry_isActive_idx" ON "KeywordRule"("industry", "isActive");

-- CreateIndex
CREATE INDEX "KeywordRule_industry_subCategory_idx" ON "KeywordRule"("industry", "subCategory");

-- CreateIndex
CREATE INDEX "BlogAnalysis_storeId_keyword_idx" ON "BlogAnalysis"("storeId", "keyword");

-- CreateIndex
CREATE INDEX "BlogAnalysis_storeId_analyzedAt_idx" ON "BlogAnalysis"("storeId", "analyzedAt");

-- CreateIndex
CREATE INDEX "ConsultationRequest_status_createdAt_idx" ON "ConsultationRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "FranchiseGroup" ADD CONSTRAINT "FranchiseGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseMembership" ADD CONSTRAINT "FranchiseMembership_franchiseGroupId_fkey" FOREIGN KEY ("franchiseGroupId") REFERENCES "FranchiseGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseMembership" ADD CONSTRAINT "FranchiseMembership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseMembership" ADD CONSTRAINT "FranchiseMembership_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

