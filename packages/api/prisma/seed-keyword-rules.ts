import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rules = [
  // ===== 소고기집 =====
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{지역}+소고기", priority: 10 },
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{지역}+한우", priority: 9 },
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{지역}+회식", priority: 8 },
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{지역}+룸식당", priority: 7 },
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{지역}+고기집", priority: 9 },
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{지역}+소고기 맛집", priority: 10 },
  { industry: "meat_beef", industryName: "소고기집", subCategory: "소고기", pattern: "{동명}+맛집", priority: 8 },

  // ===== 삼겹살집 =====
  { industry: "meat_pork", industryName: "삼겹살집", subCategory: "삼겹살", pattern: "{지역}+삼겹살", priority: 10 },
  { industry: "meat_pork", industryName: "삼겹살집", subCategory: "삼겹살", pattern: "{지역}+고기집", priority: 9 },
  { industry: "meat_pork", industryName: "삼겹살집", subCategory: "삼겹살", pattern: "{지역}+회식", priority: 7 },
  { industry: "meat_pork", industryName: "삼겹살집", subCategory: "삼겹살", pattern: "{동명}+맛집", priority: 8 },

  // ===== 밥집/한식 =====
  { industry: "korean_food", industryName: "밥집/한식", subCategory: "한식", pattern: "{동명}+맛집", priority: 10 },
  { industry: "korean_food", industryName: "밥집/한식", subCategory: "한식", pattern: "{지역}+점심", priority: 9 },
  { industry: "korean_food", industryName: "밥집/한식", subCategory: "한식", pattern: "{지역}+혼밥", priority: 7 },
  { industry: "korean_food", industryName: "밥집/한식", subCategory: "한식", pattern: "{지역}+한식", priority: 8 },
  { industry: "korean_food", industryName: "밥집/한식", subCategory: "한식", pattern: "{지역}+백반", priority: 7 },

  // ===== 카페 =====
  { industry: "cafe", industryName: "카페", subCategory: "카페", pattern: "{지역}+카페", priority: 10 },
  { industry: "cafe", industryName: "카페", subCategory: "카페", pattern: "{지역}+디저트", priority: 8 },
  { industry: "cafe", industryName: "카페", subCategory: "카페", pattern: "{지역}+데이트", priority: 7 },
  { industry: "cafe", industryName: "카페", subCategory: "카페", pattern: "{지역}+브런치", priority: 7 },
  { industry: "cafe", industryName: "카페", subCategory: "카페", pattern: "{동명}+카페", priority: 9 },

  // ===== 일식 =====
  { industry: "japanese", industryName: "일식", subCategory: "일식", pattern: "{지역}+초밥", priority: 10 },
  { industry: "japanese", industryName: "일식", subCategory: "일식", pattern: "{지역}+일식", priority: 9 },
  { industry: "japanese", industryName: "일식", subCategory: "일식", pattern: "{지역}+오마카세", priority: 8 },
  { industry: "japanese", industryName: "일식", subCategory: "일식", pattern: "{지역}+횟집", priority: 8 },
  { industry: "japanese", industryName: "일식", subCategory: "일식", pattern: "{동명}+맛집", priority: 7 },

  // ===== 중식 =====
  { industry: "chinese", industryName: "중식", subCategory: "중식", pattern: "{지역}+중국집", priority: 10 },
  { industry: "chinese", industryName: "중식", subCategory: "중식", pattern: "{지역}+중식", priority: 9 },
  { industry: "chinese", industryName: "중식", subCategory: "중식", pattern: "{지역}+짜장면", priority: 7 },
  { industry: "chinese", industryName: "중식", subCategory: "중식", pattern: "{동명}+맛집", priority: 7 },

  // ===== 치킨 =====
  { industry: "chicken", industryName: "치킨", subCategory: "치킨", pattern: "{지역}+치킨", priority: 10 },
  { industry: "chicken", industryName: "치킨", subCategory: "치킨", pattern: "{지역}+호프", priority: 7 },
  { industry: "chicken", industryName: "치킨", subCategory: "치킨", pattern: "{동명}+치킨", priority: 9 },

  // ===== 피자 =====
  { industry: "pizza", industryName: "피자", subCategory: "피자", pattern: "{지역}+피자", priority: 10 },
  { industry: "pizza", industryName: "피자", subCategory: "피자", pattern: "{지역}+피자 맛집", priority: 9 },
  { industry: "pizza", industryName: "피자", subCategory: "피자", pattern: "{동명}+맛집", priority: 7 },

  // ===== 미용실/헤어 =====
  { industry: "hair_salon", industryName: "미용실", subCategory: "헤어", pattern: "{지역}+미용실", priority: 10 },
  { industry: "hair_salon", industryName: "미용실", subCategory: "헤어", pattern: "{지역}+헤어", priority: 9 },
  { industry: "hair_salon", industryName: "미용실", subCategory: "헤어", pattern: "{지역}+펌", priority: 8 },
  { industry: "hair_salon", industryName: "미용실", subCategory: "헤어", pattern: "{지역}+염색", priority: 7 },
  { industry: "hair_salon", industryName: "미용실", subCategory: "헤어", pattern: "{동명}+미용실", priority: 9 },

  // ===== 네일 =====
  { industry: "nail", industryName: "네일", subCategory: "네일", pattern: "{지역}+네일", priority: 10 },
  { industry: "nail", industryName: "네일", subCategory: "네일", pattern: "{지역}+네일아트", priority: 9 },
  { industry: "nail", industryName: "네일", subCategory: "네일", pattern: "{동명}+네일", priority: 8 },

  // ===== 병원/의원 =====
  { industry: "clinic", industryName: "병원/의원", subCategory: "의원", pattern: "{지역}+병원", priority: 10 },
  { industry: "clinic", industryName: "병원/의원", subCategory: "의원", pattern: "{지역}+내과", priority: 9 },
  { industry: "clinic", industryName: "병원/의원", subCategory: "의원", pattern: "{지역}+치과", priority: 9 },
  { industry: "clinic", industryName: "병원/의원", subCategory: "의원", pattern: "{지역}+피부과", priority: 8 },

  // ===== 헬스/피트니스 =====
  { industry: "fitness", industryName: "헬스/피트니스", subCategory: "피트니스", pattern: "{지역}+헬스장", priority: 10 },
  { industry: "fitness", industryName: "헬스/피트니스", subCategory: "피트니스", pattern: "{지역}+PT", priority: 8 },
  { industry: "fitness", industryName: "헬스/피트니스", subCategory: "피트니스", pattern: "{지역}+필라테스", priority: 8 },
  { industry: "fitness", industryName: "헬스/피트니스", subCategory: "피트니스", pattern: "{지역}+요가", priority: 7 },

  // ===== 술집/이자카야 =====
  { industry: "bar", industryName: "술집", subCategory: "바/이자카야", pattern: "{지역}+술집", priority: 10 },
  { industry: "bar", industryName: "술집", subCategory: "바/이자카야", pattern: "{지역}+이자카야", priority: 9 },
  { industry: "bar", industryName: "술집", subCategory: "바/이자카야", pattern: "{지역}+와인바", priority: 7 },
  { industry: "bar", industryName: "술집", subCategory: "바/이자카야", pattern: "{지역}+맥주", priority: 7 },
];

async function main() {
  console.log("키워드 룰 시드 데이터 삽입 시작...");

  // 기존 룰 초기화
  await prisma.keywordRule.deleteMany();

  // 일괄 삽입
  const result = await prisma.keywordRule.createMany({ data: rules });
  console.log(`${result.count}개 키워드 룰 삽입 완료`);

  // 업종별 카운트
  const industries = await prisma.keywordRule.groupBy({
    by: ["industryName"],
    _count: true,
  });
  for (const i of industries) {
    console.log(`  ${i.industryName}: ${i._count}개`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
