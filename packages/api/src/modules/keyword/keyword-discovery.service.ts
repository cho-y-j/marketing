import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../common/prisma.service";
import { CacheService } from "../../common/cache.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { AIProvider } from "../../providers/ai/ai.provider";

/**
 * 검색량 게이트 — 회식·상견례 등 "구매의도 명확" 키워드는 검색량 무관 통과.
 * 사용자(의뢰자) 명시 룰: 월 300 미만 = 사실상 죽은 키워드 (회식 류는 예외)
 */
const KEEP_REGARDLESS_OF_VOLUME = /(회식|상견례|룸식당|룸|단체|모임|돌잔치|상견|돌잔|소개팅|기념일|데이트)/;
const MIN_VOLUME = 300;

export interface InitialKeywordResult {
  keywords: string[];
  primaryKeyword: string;
  source: "ai" | "rule_fallback_needed";
  rejectedByVolume?: string[];
  cacheHit?: boolean;
}

@Injectable()
export class KeywordDiscoveryService {
  private readonly logger = new Logger(KeywordDiscoveryService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private searchad: NaverSearchadProvider,
    private ai: AIProvider,
  ) {}

  /**
   * 신규 매장 등록 시 초기 키워드 생성 (AI 우선).
   *
   * 흐름:
   *  1) 매장 컨텍스트 hash → Redis 캐시 확인 (영구급, 90일 TTL)
   *  2) AI 호출 (의뢰자 공식 프롬프트 + 매장명 메뉴 토큰 + 사용자 예시 2개)
   *  3) 검색량 일괄 조회
   *  4) 검색량 ≥ 300 게이트 (회식/상견례 등은 예외 통과)
   *  5) 검색량 내림차순 정렬, 상위 10개
   *  6) 캐시 저장 후 반환
   *
   * 실패(키워드 0개) 시 source="rule_fallback_needed" 반환 — 호출자(store-setup)가 룰 폴백.
   */
  async generateInitialKeywords(input: {
    storeName: string;
    address: string;
    category: string;
    district: string;
  }): Promise<InitialKeywordResult> {
    const ctxHash = crypto
      .createHash("sha256")
      .update(`${input.storeName}|${input.address}|${input.category}|${input.district}`)
      .digest("hex")
      .slice(0, 12);
    const cacheKey = `kw:initial:${ctxHash}`;

    const cached = await this.cache.get<InitialKeywordResult>(cacheKey);
    if (cached && cached.keywords?.length > 0) {
      this.logger.log(`[키워드 AI] 캐시 HIT ${cacheKey} → ${cached.keywords.join(", ")}`);
      return { ...cached, cacheHit: true };
    }

    // 매장명 그대로 → AI 가 핵심 메뉴 토큰 (남해막창꼼장어 → 막창/꼼장어) 추출
    // 카테고리 콤마 분리 ("해물,생선요리" → ["해물", "생선요리"])
    const categoryParts = input.category
      .split(/[>,]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    // 지역 힌트
    const brandLocationHint = input.storeName.match(/([가-힣]{2,4}?)(본점|본관|직영점|역점|지점|점)/)?.[1];
    const dong = input.district.split(/\s+/).find((p) => /[가-힣]{2,}동$/.test(p))?.replace(/동$/, "");
    const gu = input.district.split(/\s+/).find((p) => /[가-힣]{2,}구$/.test(p))?.replace(/구$/, "");
    const regionHint = brandLocationHint || dong || gu || input.district;

    const aiCandidates = await this.callAIForInitialKeywords(
      input.storeName,
      input.address,
      input.category,
      categoryParts,
      regionHint,
    );

    if (aiCandidates.length === 0) {
      this.logger.warn(`[키워드 AI] 후보 0개 — 룰 폴백 신호 반환 (${input.storeName})`);
      return { keywords: [], primaryKeyword: "", source: "rule_fallback_needed" };
    }

    // 검색량 일괄 조회 + 게이트
    const filtered = await this.applyVolumeGate(aiCandidates);

    if (filtered.passed.length === 0) {
      this.logger.warn(
        `[키워드 AI] 게이트 통과 0개 — 룰 폴백 신호. 후보: ${aiCandidates.join(", ")}`,
      );
      return { keywords: [], primaryKeyword: "", source: "rule_fallback_needed" };
    }

    // 검색량 내림차순 정렬, 상위 10개
    filtered.passed.sort((a, b) => b.volume - a.volume);
    const top = filtered.passed.slice(0, 10);
    const keywords = top.map((k) => k.keyword);
    const primaryKeyword = keywords[0]; // 검색량 최고

    const result: InitialKeywordResult = {
      keywords,
      primaryKeyword,
      source: "ai",
      rejectedByVolume: filtered.rejected,
    };

    // 캐시 90일 (매장 정보 안 바뀌면 영구급)
    await this.cache.set(cacheKey, result, 90 * 86400);
    this.logger.log(
      `[키워드 AI] 생성 ${keywords.length}개 (대표="${primaryKeyword}", 폐기 ${filtered.rejected.length}개): ${keywords.join(", ")}`,
    );
    return result;
  }

  /**
   * AI 호출 — 의뢰자 공식 프롬프트 + 사용자 예시 2개 + 매장명 핵심메뉴 추출 지시
   */
  private async callAIForInitialKeywords(
    storeName: string,
    address: string,
    category: string,
    categoryParts: string[],
    regionHint: string,
  ): Promise<string[]> {
    const systemPrompt = `너는 자영업 매장의 네이버 광고/노출 키워드를 설계하는 마케팅 전문가다.
매장 정보(매장명, 주소, 카테고리)를 보고 "검색량이 충분히 나오면서, 실제 방문 의도가 있는 고객이 검색할 만한 키워드"를 설계한다.

[엄격 규칙]
1. 모든 키워드는 반드시 [지역명] 또는 [지역명+역]을 포함한다. 메뉴 단독("아구찜", "막창") 금지.
2. 키워드 구조 3가지를 균형 있게 섞는다:
   - 유입: "[지역] 맛집", "[역] 맛집"
   - 상황: "[지역] 점심 맛집", "[지역] 회식", "[지역] 룸식당", "[지역] 상견례", "[지역] 데이트"
   - 메뉴: "[지역] [핵심메뉴]" — 매장명/카테고리에서 추출한 핵심 메뉴 단어 사용
3. 매장명에서 핵심 메뉴 단어 추출 필수.
   예: "남해막창꼼장어" → 핵심 메뉴 = ["막창", "꼼장어"] → "[지역] 막창", "[지역] 꼼장어"
   예: "찬란한아구 공덕직영점" → 핵심 메뉴 = ["아구찜", "해물찜"]
4. 지역 단위는 검색량이 나오는 단위로 자동 선택:
   - 동/역 검색량이 충분하면 "[동] 맛집"
   - 너무 좁으면 "[시] 맛집" 또는 "[구] 맛집"으로 자동 강등
5. 포괄적 카테고리("한식", "음식점", "양식", "고기집") 단독 키워드 금지.
6. 회식·상견례·룸식당·단체·돌잔치·기념일 등 상황 키워드는 검색량 적어도 가치 있음 — 매장 분위기에 맞으면 1~2개 포함.
7. 매장 업종이 회식 부적합(카페/디저트/분식)이면 "데이트", "점심" 등으로 대체.
8. 총 7~10개. 중복/유사어 제거.
9. 출력은 JSON 배열만. 설명·주석·마크다운 금지.

[참고 예시 1] 찬란한아구 공덕직영점 (서울 마포구 도화동, 한식 > 아구찜,해물찜)
["공덕 맛집", "공덕역 맛집", "공덕 아구찜", "공덕 해물찜", "공덕 점심 맛집", "공덕역 점심 맛집"]

[참고 예시 2] 육목원 (서울 강남구, 소고기집)
["강남 맛집", "강남역 맛집", "강남 소고기", "강남역 소고기", "강남 회식", "강남역 회식", "뱅뱅사거리 맛집"]`;

    const userPrompt = `매장 정보:
- 매장명: ${storeName}
- 주소: ${address}
- 카테고리(원본): ${category}
- 카테고리(분해): ${categoryParts.join(", ") || "-"}
- 지역 힌트(역명 우선): ${regionHint || "-"}

위 매장의 핵심 메뉴를 매장명·카테고리에서 직접 추출하고, 규칙대로 키워드 7~10개 JSON 배열만 응답.`;

    try {
      const response = await this.ai.analyze(systemPrompt, userPrompt);
      const match = response.content.match(/\[[\s\S]*\]/);
      if (!match) {
        this.logger.warn(`[키워드 AI] JSON 배열 미발견 — 응답: ${response.content.slice(0, 200)}`);
        return [];
      }
      const parsed = JSON.parse(match[0]);
      const cleaned = (Array.isArray(parsed) ? parsed : [])
        .filter((k: any) => typeof k === "string")
        .map((k: string) => k.trim().replace(/,/g, "").replace(/\s+/g, " "))
        .filter((k: string) => k.length >= 2 && k.length <= 30);
      // 중복 제거
      const unique = [...new Set(cleaned)];
      this.logger.log(`[키워드 AI] ${response.provider} 응답 ${unique.length}개: ${unique.join(", ")}`);
      return unique;
    } catch (e: any) {
      this.logger.warn(`[키워드 AI] 호출 실패: ${e.message}`);
      return [];
    }
  }

  /**
   * 검색량 게이트.
   *  - 회식/상견례/룸/단체/모임 등 KEEP 패턴 키워드: 검색량 무관 통과 (단 ≥ 1 보장)
   *  - 그 외: 월 검색량 ≥ 300 통과
   */
  private async applyVolumeGate(
    candidates: string[],
  ): Promise<{ passed: Array<{ keyword: string; volume: number }>; rejected: string[] }> {
    const volumeMap = new Map<string, number>();
    // 검색광고 API 는 공백 제거된 키워드를 받음
    const queryKeys = candidates.map((k) => k.replace(/\s+/g, ""));

    // 5개씩 배치 (rate limit 회피, 기존 코드 패턴 따름)
    const BATCH = 5;
    for (let i = 0; i < queryKeys.length; i += BATCH) {
      const batch = queryKeys.slice(i, i + BATCH);
      try {
        const stats = await this.searchad.getKeywordStats(batch);
        for (const s of stats) {
          const total = this.searchad.getTotalMonthlySearch(s);
          volumeMap.set(s.relKeyword, total);
        }
      } catch (e: any) {
        this.logger.warn(`[키워드 AI] 검색량 조회 실패: ${e.message}`);
      }
    }

    const passed: Array<{ keyword: string; volume: number }> = [];
    const rejected: string[] = [];
    for (const kw of candidates) {
      const queryKey = kw.replace(/\s+/g, "");
      const vol = volumeMap.get(queryKey) ?? 0;
      if (KEEP_REGARDLESS_OF_VOLUME.test(kw)) {
        passed.push({ keyword: kw, volume: Math.max(vol, 1) });
      } else if (vol >= MIN_VOLUME) {
        passed.push({ keyword: kw, volume: vol });
      } else {
        rejected.push(`${kw}(${vol})`);
      }
    }
    return { passed, rejected };
  }

  // 연관 키워드 + AI 히든 키워드 발굴
  async discoverKeywords(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { keywords: true, competitors: true },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    this.logger.log(`키워드 발굴 시작: ${store.name}`);

    const existingKeywords = new Set(store.keywords.map((k) => k.keyword));
    const district = store.district || "";
    const category = store.subCategory || store.category || "";

    // 시드 키워드 — 기존 TOP 3 + 지역+업종
    const seeds: string[] = [];
    if (district && category) seeds.push(`${district} ${category}`.replace(/\s+/g, ""));
    if (district) seeds.push(`${district}맛집`);
    store.keywords.slice(0, 3).forEach((k) => seeds.push(k.keyword.replace(/\s+/g, "")));

    if (seeds.length === 0) {
      return { discovered: [], hidden: [], aiRecommended: [], message: "시드 키워드가 없습니다. 키워드를 먼저 추가해주세요." };
    }

    // 1. 검색광고 API 연관 키워드 + 지역 필터 + 포괄어 필터
    //    (네이버 API는 "단양맛집" 시드에 "거창맛집" 같은 전국 지역맛집을 반환 — 접미사 패턴 매칭뿐)
    //    → 우리 매장 지역과 무관한 지역명 포함 키워드 자동 폐기
    const regionTokens = this.extractRegionTokens(store.address || "", store.district || "", store.name);
    const otherRegionBlacklist = this.buildOtherRegionBlacklist(regionTokens);
    const POLYMERIC_SOLO = new Set([
      "맛집", "한식", "양식", "일식", "중식", "분식", "음식점", "고기집",
      "술집", "카페", "치킨", "피자", "족발", "보쌈", "고기", "식당",
      "찜닭", "조개구이", "해물찜", "코다리", "아귀찜", "회",
    ]);

    const isAcceptable = (kw: string): boolean => {
      const trimmed = kw.trim();
      if (trimmed.length < 2 || trimmed.length > 30) return false;
      if (trimmed.includes(">") || trimmed.includes("{") || trimmed.includes("}")) return false;
      if (POLYMERIC_SOLO.has(trimmed)) return false;
      // 매장 지역 토큰 중 하나라도 포함해야 함 (토큰이 있을 때만 검증)
      if (regionTokens.length > 0 && !regionTokens.some((t) => trimmed.includes(t))) return false;
      // 다른 지역명 포함 금지 (거창맛집 등)
      if (otherRegionBlacklist.some((t) => trimmed.includes(t))) return false;
      return true;
    };

    const allRelated: Map<string, any> = new Map();
    for (const seed of seeds.slice(0, 3)) {
      try {
        const related = await this.searchad.getRelatedKeywords(seed);
        for (const r of related) {
          if (!existingKeywords.has(r.relKeyword) && !allRelated.has(r.relKeyword) && isAcceptable(r.relKeyword)) {
            allRelated.set(r.relKeyword, {
              keyword: r.relKeyword,
              monthlyVolume: (r.monthlyPcQcCnt || 0) + (r.monthlyMobileQcCnt || 0),
              competition: r.compIdx,
              source: "NAVER_API",
            });
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch (e: any) {
        this.logger.warn(`연관 키워드 조회 실패 [${seed}]: ${e.message}`);
      }
    }

    // 2. AI 키워드 추천 — 의뢰자(마케팅 전문가) 공식 프롬프트 (store-setup과 동일)
    //    지역+역 쌍 + 3카테고리(유입/상황/메뉴) + 10개 이하 + 방문 의도
    let aiKeywords: string[] = [];
    try {
      // 지역 힌트 — 매장명 브랜드 힌트(공덕) 우선, 없으면 동/구
      // (이유: 매장이 '도화동'에 있어도 고객은 '공덕역 맛집'으로 검색 — 브랜드 지명이 유입 핵심)
      const brandLocationHint = store.name.match(/([가-힣]{2,4}?)(직영점|역점|지점|점)/)?.[1];
      const dong = district.split(/\s+/).find((p) => /[가-힣]{2,}동$/.test(p))?.replace(/동$/, "");
      const gu = district.split(/\s+/).find((p) => /[가-힣]{2,}구$/.test(p))?.replace(/구$/, "");
      const regionHint = brandLocationHint || dong || gu || district;

      const categoryParts = category
        .split(/[>,]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);

      const systemPrompt = `특정 매장 기준으로 검색 키워드를 구성해줘.
단순 검색량 기준이 아니라, 실제 고객 유입 흐름을 반영해서 키워드를 만들어줘.

조건은 아래 기준을 반드시 지켜줘.

1. 지역 키워드는 '지역명' + '지역명+역' 형태를 모두 포함할 것
2. 키워드는 반드시 아래 3가지 구조로 나눌 것
   - 유입 키워드 (예: 맛집)
   - 상황 키워드 (예: 점심, 술집 등)
   - 메뉴 키워드 (예: 대표 음식명)
3. 각 카테고리를 균형 있게 포함하여 총 10개 이하로 구성할 것
4. 고객 검색 흐름을 반영할 것 (유입 → 상황 → 메뉴 선택 단계)
5. 실제 매장 방문으로 이어질 가능성이 높은 구조로 구성할 것
6. 업종이 명확한 경우, '고기집'과 같은 포괄적인 키워드는 제외하고 대표 메뉴 또는 세부 카테고리 키워드 중심으로 구성할 것
7. 단순 정보 탐색이 아닌, 실제 방문 의도가 있는 키워드만 포함할 것
8. 유사 의미 키워드는 중복되지 않도록 최적화할 것
9. 기존 키워드와 중복되지 않는 신규 키워드만 제안할 것

※ 출력은 설명 없이 키워드만 JSON 배열 형태로 제공할 것. 예: ["공덕 맛집", "공덕역 맛집", "공덕 아구찜"]`;

      const userPrompt = `매장 정보:
- 매장명: ${store.name}
- 지역명(역명 조합 기준): ${regionHint || "-"}
- 주소: ${store.address || ""}
- 카테고리: ${category}
- 대표 메뉴/세부 카테고리: ${categoryParts.join(", ") || "-"}
- 기존 키워드(중복 제외): ${[...existingKeywords].slice(0, 20).join(", ") || "-"}

위 조건을 지켜서 키워드 JSON 배열만 응답.`;

      const response = await this.ai.analyze(systemPrompt, userPrompt);
      const match = response.content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        aiKeywords = parsed
          .filter((k: any) => typeof k === "string")
          .map((k: string) => k.trim().replace(/,/g, ""))
          .filter((k: string) =>
            k.length >= 2 && k.length <= 30 && !existingKeywords.has(k),
          );
        this.logger.log(`AI 키워드 생성 [${response.provider}]: ${aiKeywords.length}개 — ${aiKeywords.join(" / ")}`);
      }
    } catch (e: any) {
      this.logger.warn(`AI 키워드 생성 실패: ${e.message}`);
    }

    // AI 키워드 검색량 조회
    const aiWithVolume: any[] = [];
    if (aiKeywords.length > 0) {
      try {
        const stats = await this.searchad.getKeywordStats(aiKeywords.map((k) => k.replace(/\s+/g, "")));
        for (const s of stats) {
          const vol = this.searchad.getTotalMonthlySearch(s);
          if (vol > 0) {
            aiWithVolume.push({
              keyword: s.relKeyword,
              monthlyVolume: vol,
              competition: s.compIdx,
              source: "AI_HIDDEN",
            });
          }
        }
      } catch {}
    }

    // 3. 결과 정리
    const discovered = [...allRelated.values()]
      .sort((a, b) => (b.monthlyVolume || 0) - (a.monthlyVolume || 0))
      .slice(0, 15);

    // 히든 키워드 = 경쟁 낮고 검색량 500~50000
    const hidden = [...discovered, ...aiWithVolume]
      .filter((k) => k.competition !== "높음" && k.monthlyVolume >= 500 && k.monthlyVolume <= 50000)
      .sort((a, b) => b.monthlyVolume - a.monthlyVolume)
      .slice(0, 5);

    this.logger.log(`키워드 발굴 완료: API ${discovered.length}개, AI ${aiWithVolume.length}개, 히든 ${hidden.length}개`);

    return {
      discovered,
      hidden,
      aiRecommended: aiWithVolume,
      seed: seeds[0],
    };
  }

  /**
   * 매장의 주소/지역/이름에서 "지역 토큰" 추출.
   * 여기 포함된 토큰이 키워드 문자열에 들어가야만 통과.
   * 예) "충북 단양군 단양읍 별곡9길" → ["단양", "별곡"]
   *     "서울 마포구 도화동" + 매장명 "공덕직영점" → ["마포", "도화", "공덕"]
   */
  private extractRegionTokens(address: string, district: string, storeName: string): string[] {
    const tokens = new Set<string>();
    const addParts = (src: string) => {
      for (const p of src.split(/\s+/).filter(Boolean)) {
        const stripped = p.replace(/(시|군|구|동|읍|면|도|광역시|특별시)$/, "");
        if (stripped.length >= 2) tokens.add(stripped);
      }
    };
    addParts(address);
    addParts(district);
    // 매장명 지역 힌트 추출 (예: "공덕직영점" → "공덕", "강남역점" → "강남")
    const brandHint = storeName.match(/([가-힣]{2,4}?)(직영점|역점|지점|점)/)?.[1];
    if (brandHint && brandHint.length >= 2) tokens.add(brandHint);
    // 너무 일반적인 시·도 이름은 제외 (과매칭 방지)
    const TOO_GENERIC = new Set(["서울", "경기", "충북", "충남", "경북", "경남", "전북", "전남", "강원", "제주"]);
    return [...tokens].filter((t) => !TOO_GENERIC.has(t));
  }

  /**
   * 전국 유명 지역명 블랙리스트 중, 매장 지역 토큰과 겹치지 않는 것만 반환.
   * 키워드에 이 블랙리스트의 지역명이 포함돼 있으면 매장과 무관 판정 → 폐기.
   */
  private buildOtherRegionBlacklist(myTokens: string[]): string[] {
    const ALL_REGIONS = [
      // 서울 25개 구
      "강남", "강동", "강북", "강서", "관악", "광진", "구로", "금천", "노원", "도봉",
      "동대문", "동작", "마포", "서대문", "서초", "성동", "성북", "송파", "양천", "영등포",
      "용산", "은평", "종로", "중구", "중랑",
      // 경기 주요 시
      "수원", "성남", "고양", "용인", "부천", "안산", "안양", "남양주", "화성", "평택", "의정부", "시흥", "파주", "김포",
      // 광역시
      "부산", "대구", "인천", "광주", "대전", "울산", "세종",
      // 지방 소도시 일부
      "단양", "제천", "청주", "천안", "아산", "공주", "거창", "창녕", "곡성", "영천", "괴산", "태안",
      "춘천", "원주", "강릉", "속초", "포항", "경주", "울진", "남해", "여수", "순천", "군산", "전주",
    ];
    const mine = new Set(myTokens);
    // 내 지역 토큰이 블랙리스트 단어를 포함하면 그 단어도 제외 (예: 내가 "강남" → "강남" 빼기)
    return ALL_REGIONS.filter((r) => !mine.has(r) && ![...mine].some((t) => t.includes(r) || r.includes(t)));
  }
}
