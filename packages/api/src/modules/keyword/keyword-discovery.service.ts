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

    // 2. AI 히든 키워드 추천
    let aiKeywords: string[] = [];
    try {
      const aiPrompt = `매장 정보:
- 매장명: ${store.name}
- 주소: ${store.address || ""}
- 카테고리: ${category}
- 지역: ${district}
- ��존 키워드: ${[...existingKeywords].join(", ")}
- 경쟁매장: ${store.competitors.map((c) => c.competitorName).join(", ")}

이 ���장이 아직 추적하지 않는 "히든 키워드"를 발굴해줘.
히든 키워드 = 검색량은 적지만 전환율이 높은 키워드, 또는 경쟁자가 놓치고 있는 틈새 키워드.

규칙:
1. 기존 키워드와 중복 금지
2. 반드시 실제 주소 기반 (${district})
3. 구체적�� 상황 키워드 포함 (예: "가경동 점심 추천", "청주 회식장소")
4. 시즌/이벤트 키워드 포함 (현재 4월)
5. 5~8개 추천

JSON 배열로만 응답:
["키워드1", "키워드2", ...]`;

      const response = await this.ai.analyze(
        "너는 네이버 플레이스 SEO 전문가이자 히든 키워드 발굴 전문가다.",
        aiPrompt,
      );
      const match = response.content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        aiKeywords = parsed.filter((k: string) =>
          typeof k === "string" && k.length >= 2 && !existingKeywords.has(k),
        );
      }
    } catch (e: any) {
      this.logger.warn(`AI 히든 키워드 생성 실패: ${e.message}`);
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
