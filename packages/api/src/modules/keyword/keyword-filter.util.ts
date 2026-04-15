/**
 * 의뢰자 지시 기반 키워드 필터 유틸.
 *
 * 규칙:
 *  - 월 300 미만은 "사실상 없는 키워드"로 간주 → 제외
 *  - 단, 회식/상견례/룸/단체/모임/돌잔치/송년/연말 계열은 저볼륨이라도 유지 (방문 의도 명확)
 *  - 지역(동/구/역/시) 정보가 전혀 포함되지 않은 광범위 키워드는 매장 기반 노출에 무의미 → 제외
 */
export const KEYWORD_KEEP_PATTERN = /(회식|상견례|룸|단체|모임|돌잔치|송년|연말)/;

export function isLowVolumeNonException(
  keyword: string,
  monthlyVolume: number | null | undefined,
): boolean {
  if (monthlyVolume == null) return false;
  if (monthlyVolume >= 300) return false;
  if (KEYWORD_KEEP_PATTERN.test(keyword)) return false;
  return true;
}

/**
 * 지역성 검증 — 매장과 무관한 순수 메뉴/일반명 키워드 감지.
 * regionTokens: 매장의 시/구/동/역 후보 집합 (예: ["공덕", "공덕역", "마포", "도화동"])
 * 키워드에 해당 토큰이 하나도 없으면 지역성 결여로 간주.
 * (매장명 전체 일치가 아닌 브랜드 토큰 — 예: "공덕" — 은 regionTokens에 포함시켜 매칭)
 */
export function isNonRegional(keyword: string, regionTokens: string[]): boolean {
  const k = keyword.replace(/\s+/g, "");
  for (const tok of regionTokens) {
    if (!tok) continue;
    if (k.includes(tok.replace(/\s+/g, ""))) return false;
  }
  return true;
}
