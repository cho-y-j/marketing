/**
 * KAMIS 공개 가격 제공 품목 마스터 (소매가 기준).
 * 이 리스트에 없는 품목 (보리, 흑마늘, 참기름, 아귀 등) 은 KAMIS 가격 조회 불가.
 *
 * 수집 방법: 각 부류코드(100~600) + p_product_cls_code=01 (소매) + 오늘 날짜로
 *   dailyPriceByCategoryList 호출해 item_name 전수 조사.
 *
 * 업데이트: KAMIS 가 품목을 추가/변경하면 이 파일도 갱신 필요.
 * 마지막 갱신: 2026-04-21
 */
export const KAMIS_CATALOG = {
  "식량작물": ["쌀", "찹쌀", "콩", "팥", "녹두", "고구마", "감자"],
  "채소류": [
    "배추", "양배추", "시금치", "상추", "얼갈이배추",
    "수박", "참외", "오이", "호박", "토마토", "딸기",
    "무", "당근", "열무", "건고추", "풋고추", "붉은고추",
    "양파", "파", "생강", "고춧가루", "미나리", "깻잎",
    "피망", "파프리카", "멜론", "깐마늘(국산)",
    "알배기배추", "브로콜리", "방울토마토",
  ],
  "특용작물": [
    "참깨", "땅콩", "느타리버섯", "팽이버섯", "새송이버섯",
    "호두", "아몬드",
  ],
  "과일류": [
    "사과", "배", "바나나", "참다래", "파인애플",
    "오렌지", "레몬", "망고", "아보카도",
  ],
  "축산물": ["소", "돼지", "수입 소고기", "수입 돼지고기", "닭", "계란", "우유"],
  "수산물": [
    "고등어", "꽁치", "갈치", "조기", "명태", "삼치",
    "물오징어", "마른멸치", "마른오징어", "김", "마른미역",
    "굴", "수입조기", "새우젓", "멸치액젓", "천일염",
    "전복", "새우", "꽃게", "홍합", "가리비",
    "건다시마", "바지락", "고등어필렛",
  ],
} as const;

/** 모든 KAMIS 품목을 단일 배열로 (AI 프롬프트 주입용) */
export const KAMIS_ALL_ITEMS: string[] = Object.values(KAMIS_CATALOG).flat();

/** 한글 카테고리 → KAMIS 부류 코드 */
export const CATEGORY_NAME_TO_CODE: Record<string, string> = {
  "식량작물": "100",
  "채소류": "200",
  "특용작물": "300",
  "과일류": "400",
  "축산물": "500",
  "수산물": "600",
};

/** 품목명 → KAMIS 부류 코드 (역매핑) */
export function findCategoryCode(itemName: string): string | null {
  const norm = itemName.replace(/\s+/g, "").trim();
  for (const [catName, items] of Object.entries(KAMIS_CATALOG)) {
    const hit = items.some((it) => {
      const itn = it.replace(/\s+/g, "").trim();
      return itn === norm || itn.includes(norm) || norm.includes(itn);
    });
    if (hit) return CATEGORY_NAME_TO_CODE[catName] ?? null;
  }
  return null;
}

/** KAMIS 등록 여부 검증 (정확 일치 + 부분 일치) */
export function isKamisRegistered(name: string): boolean {
  const n = name.replace(/\s+/g, "").trim();
  return KAMIS_ALL_ITEMS.some((it) => {
    const itn = it.replace(/\s+/g, "").trim();
    return itn === n || itn.includes(n) || n.includes(itn);
  });
}
