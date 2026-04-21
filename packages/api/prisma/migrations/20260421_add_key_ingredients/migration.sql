-- Store 에 주재료 리스트 필드 추가 (KAMIS 가격 추적용)
ALTER TABLE "Store" ADD COLUMN "keyIngredients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
