-- KeywordRankHistory: 일별 1개 row + 추정→실측 자연 마이그레이션 구조로 전환
-- 사장님 룰 (2026-04-30): 백필=isEstimated, 실측이 누적되면 같은 날짜 row 를 덮어씀.

-- 1. 컬럼 추가 (NULL 허용으로 추가 후 채우고 NOT NULL 전환)
ALTER TABLE "KeywordRankHistory" ADD COLUMN "snapshotDate" DATE;
ALTER TABLE "KeywordRankHistory" ADD COLUMN "isEstimated" BOOLEAN NOT NULL DEFAULT false;

-- 2. 기존 row 의 snapshotDate = checkedAt::date
UPDATE "KeywordRankHistory" SET "snapshotDate" = "checkedAt"::date;

-- 3. 자정 시각 row 는 백필 데이터 (CompetitorBackfillService 가 자정으로 INSERT) → isEstimated=true 마킹
UPDATE "KeywordRankHistory"
SET "isEstimated" = true
WHERE EXTRACT(HOUR FROM "checkedAt") = 0
  AND EXTRACT(MINUTE FROM "checkedAt") = 0
  AND EXTRACT(SECOND FROM "checkedAt") = 0;

-- 4. 중복 (storeId, keyword, snapshotDate) 정리: 실측(isEstimated=false) 우선, 같으면 최신 checkedAt 만 보존
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "storeId", keyword, "snapshotDate"
      ORDER BY "isEstimated" ASC, "checkedAt" DESC
    ) as rn
  FROM "KeywordRankHistory"
)
DELETE FROM "KeywordRankHistory" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 5. NOT NULL 전환
ALTER TABLE "KeywordRankHistory" ALTER COLUMN "snapshotDate" SET NOT NULL;

-- 6. unique 제약 — 매일 cron 이 upsert 할 키
CREATE UNIQUE INDEX "KeywordRankHistory_storeId_keyword_snapshotDate_key"
  ON "KeywordRankHistory" ("storeId", keyword, "snapshotDate");
