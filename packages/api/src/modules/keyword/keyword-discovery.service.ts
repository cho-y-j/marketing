import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { AIProvider } from "../../providers/ai/ai.provider";

@Injectable()
export class KeywordDiscoveryService {
  private readonly logger = new Logger(KeywordDiscoveryService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private ai: AIProvider,
  ) {}

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

    // 1. 검색광고 API 연관 키워드 (여러 시드로 조회)
    const allRelated: Map<string, any> = new Map();
    for (const seed of seeds.slice(0, 3)) {
      try {
        const related = await this.searchad.getRelatedKeywords(seed);
        for (const r of related) {
          if (!existingKeywords.has(r.relKeyword) && !allRelated.has(r.relKeyword)) {
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
}
