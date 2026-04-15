import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { MarketingEngineService } from "./marketing-engine.service";

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private marketingEngine: MarketingEngineService,
  ) {}

  async getDashboardData(storeId: string) {
    // 대시보드/진단이 같은 store를 쓰므로 한 번만 조회 (keywords는 모두 로드, 진단용 공용)
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: {
          orderBy: [
            { currentRank: { sort: "asc", nulls: "last" } },
            { monthlySearchVolume: "desc" },
          ],
        },
        competitors: {
          orderBy: { receiptReviewCount: "desc" },
        },
      },
    });
    if (!store) return null;

    const analysis = store.analyses[0] || null;
    const keywords = store.keywords;
    const competitors = store.competitors;

    // === 1. 현재 상태 요약 ===
    const myReviews = (analysis?.receiptReviewCount ?? 0) + (analysis?.blogReviewCount ?? 0);
    const avgCompetitorReviews = competitors.length > 0
      ? Math.round(
          competitors.reduce((sum, c) => sum + (c.receiptReviewCount ?? 0) + (c.blogReviewCount ?? 0), 0) / competitors.length,
        )
      : 0;

    const rankedKeywords = keywords.filter((k) => k.currentRank != null);
    const avgRank = rankedKeywords.length > 0
      ? Math.round(rankedKeywords.reduce((sum, k) => sum + (k.currentRank ?? 0), 0) / rankedKeywords.length)
      : null;

    // 경쟁력 수준 판단
    let competitiveLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    if (avgRank && avgRank <= 10) competitiveLevel = "HIGH";
    else if (avgRank && avgRank <= 30) competitiveLevel = "MEDIUM";

    // === 2~3. 마케팅 엔진으로 부족점 + 액션 자동 생성 (store 재사용) ===
    const diagnosis = await this.marketingEngine.diagnose(storeId, store);
    const { problems, actions: topActions, keywordStrategy } = diagnosis;

    // === 4. 키워드 순위 현황 (상위 5개) ===
    const keywordRanks = keywords.slice(0, 8).map((k) => ({
      keyword: k.keyword,
      currentRank: k.currentRank,
      previousRank: k.previousRank,
      change: k.previousRank && k.currentRank
        ? k.previousRank - k.currentRank
        : null,
      monthlyVolume: k.monthlySearchVolume,
      type: k.type,
    }));

    // === 5. 경쟁사 비교 요약 ===
    const competitorComparison = competitors.slice(0, 5).map((c) => ({
      name: c.competitorName,
      receiptReviewCount: c.receiptReviewCount ?? 0,
      blogReviewCount: c.blogReviewCount ?? 0,
      dailySearchVolume: c.dailySearchVolume ?? 0,
      type: c.type,
    }));

    return {
      store: {
        name: store.name,
        category: store.category,
        address: store.address,
        competitiveScore: store.competitiveScore,
      },
      status: {
        level: competitiveLevel,
        avgRank,
        totalKeywords: keywords.length,
        totalCompetitors: competitors.length,
        myReviews,
        avgCompetitorReviews,
      },
      // 마케팅 엔진 결과
      marketingPhase: {
        code: diagnosis.phase,
        label: diagnosis.phaseLabel,
        description: diagnosis.phaseDescription,
      },
      problems,
      actions: topActions,
      aiPending: diagnosis.aiPending ?? false,
      keywordStrategy,
      keywordRanks,
      competitorComparison,
      myMetrics: analysis
        ? {
            receiptReviewCount: analysis.receiptReviewCount,
            blogReviewCount: analysis.blogReviewCount,
            dailySearchVolume: analysis.dailySearchVolume,
            saveCount: analysis.saveCount,
            trafficScore: analysis.trafficScore,
            engagementScore: analysis.engagementScore,
            satisfactionScore: analysis.satisfactionScore,
          }
        : null,
    };
  }
}
