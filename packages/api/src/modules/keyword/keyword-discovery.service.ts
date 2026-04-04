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

  // 연관 키워드 발굴
  async discoverKeywords(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { keywords: true },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    this.logger.log(`키워드 발굴 시작: ${store.name}`);

    // 기존 키워드를 시드로 연관 키워드 조회
    const existingKeywords = store.keywords.map((k) => k.keyword);
    const seedKeyword = existingKeywords[0] ||
      `${store.district || ""} ${store.subCategory || store.category || ""}`.trim();

    if (!seedKeyword) {
      return { discovered: [], message: "시드 키워드가 없습니다. 키워드를 먼저 추가해주세요." };
    }

    // 1. 검색광고 API 연관 키워드
    let relatedKeywords: any[] = [];
    try {
      relatedKeywords = await this.searchad.getRelatedKeywords(seedKeyword);
    } catch (e: any) {
      this.logger.warn(`연관 키워드 조회 실패: ${e.message}`);
    }

    // 2. 조합 키워드 생성
    const combinations: string[] = [];
    const modifiers = ["맛집", "추천", "인기", "유명", "근처", "데이트", "회식", "소개팅"];
    const district = store.district || "";
    const category = store.subCategory || store.category || "";

    for (const mod of modifiers) {
      if (district) combinations.push(`${district} ${mod}`);
      if (category && district) combinations.push(`${district} ${category}`);
    }

    // 3. 검색량 조회
    const allCandidates = [
      ...relatedKeywords.map((k) => k.relKeyword),
      ...combinations,
    ].filter((kw) => !existingKeywords.includes(kw));

    const unique = [...new Set(allCandidates)].slice(0, 20);

    let withVolume: any[] = [];
    if (unique.length > 0) {
      try {
        const stats = await this.searchad.getKeywordStats(unique.slice(0, 5));
        withVolume = stats.map((s) => ({
          keyword: s.relKeyword,
          monthlyVolume: this.searchad.getTotalMonthlySearch(s),
          competition: s.compIdx,
        }));
      } catch (e: any) {
        this.logger.warn(`검색량 조회 실패: ${e.message}`);
        withVolume = unique.map((kw) => ({ keyword: kw, monthlyVolume: null, competition: null }));
      }
    }

    // 경쟁 낮고 검색량 적정한 키워드 = 히든 키워드
    const hidden = withVolume
      .filter((k) => k.competition !== "높음" && k.monthlyVolume && k.monthlyVolume > 100)
      .slice(0, 5);

    this.logger.log(`키워드 발굴 완료: ${withVolume.length}개 (히든 ${hidden.length}개)`);

    return {
      discovered: withVolume,
      hidden,
      seed: seedKeyword,
    };
  }
}
