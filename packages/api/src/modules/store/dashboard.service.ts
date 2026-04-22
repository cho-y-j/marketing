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

    // === 6. 주간 성과/격차 (홈 대시보드 "지금 경쟁 구도" 섹션용) ===
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setUTCHours(0, 0, 0, 0);

    // 내 매장 주간 증감
    const [myLatest, myWeekAgo] = await Promise.all([
      this.prisma.storeDailySnapshot.findFirst({
        where: { storeId },
        orderBy: { date: "desc" },
        select: { visitorReviewCount: true, blogReviewCount: true, date: true },
      }),
      this.prisma.storeDailySnapshot.findFirst({
        where: { storeId, date: { lte: weekAgo } },
        orderBy: { date: "desc" },
        select: { visitorReviewCount: true, blogReviewCount: true, date: true },
      }),
    ]);
    const myOldest = myWeekAgo
      ? null
      : await this.prisma.storeDailySnapshot.findFirst({
          where: { storeId },
          orderBy: { date: "asc" },
          select: { visitorReviewCount: true, blogReviewCount: true, date: true },
        });
    const myBaseline = myWeekAgo || myOldest;
    const myWeeklyGrowth =
      myLatest && myBaseline
        ? {
            visitor:
              myLatest.visitorReviewCount != null && myBaseline.visitorReviewCount != null
                ? myLatest.visitorReviewCount - myBaseline.visitorReviewCount
                : null,
            blog:
              myLatest.blogReviewCount != null && myBaseline.blogReviewCount != null
                ? myLatest.blogReviewCount - myBaseline.blogReviewCount
                : null,
            spanDays: myBaseline.date
              ? Math.max(
                  1,
                  Math.round((myLatest.date.getTime() - myBaseline.date.getTime()) / 86400000),
                )
              : null,
            isEstimated: !myWeekAgo, // 7일치 안 쌓여있으면 추정
          }
        : null;

    // 경쟁사 주간 증감 top 3 (가장 공격적인 경쟁사 = 증가 많은 순)
    const placeIds = competitors
      .map((c) => c.competitorPlaceId)
      .filter((x): x is string => !!x)
      .slice(0, 10);
    const compSnapshots = placeIds.length
      ? await this.prisma.competitorDailySnapshot.findMany({
          where: {
            storeId,
            competitorPlaceId: { in: placeIds },
          },
          orderBy: { date: "desc" },
          select: {
            competitorPlaceId: true,
            date: true,
            visitorReviewCount: true,
            blogReviewCount: true,
          },
        })
      : [];
    // placeId 별 latest + weekAgo
    const byPlace = new Map<
      string,
      {
        latest: { visitor: number | null; blog: number | null; date: Date } | null;
        weekAgo: { visitor: number | null; blog: number | null; date: Date } | null;
        oldest: { visitor: number | null; blog: number | null; date: Date } | null;
      }
    >();
    for (const s of compSnapshots) {
      const key = s.competitorPlaceId;
      const entry = byPlace.get(key) || { latest: null, weekAgo: null, oldest: null };
      if (!entry.latest) {
        entry.latest = {
          visitor: s.visitorReviewCount,
          blog: s.blogReviewCount,
          date: s.date,
        };
      }
      if (s.date.getTime() <= weekAgo.getTime() && !entry.weekAgo) {
        entry.weekAgo = {
          visitor: s.visitorReviewCount,
          blog: s.blogReviewCount,
          date: s.date,
        };
      }
      entry.oldest = {
        visitor: s.visitorReviewCount,
        blog: s.blogReviewCount,
        date: s.date,
      };
      byPlace.set(key, entry);
    }
    const competitorWeeklyGrowth = competitors
      .filter((c) => c.competitorPlaceId && byPlace.has(c.competitorPlaceId))
      .map((c) => {
        const e = byPlace.get(c.competitorPlaceId!)!;
        const baseline = e.weekAgo || e.oldest;
        const latest = e.latest;
        if (!latest || !baseline) return null;
        const visitor =
          latest.visitor != null && baseline.visitor != null
            ? latest.visitor - baseline.visitor
            : null;
        const blog =
          latest.blog != null && baseline.blog != null ? latest.blog - baseline.blog : null;
        const spanDays = Math.max(
          1,
          Math.round((latest.date.getTime() - baseline.date.getTime()) / 86400000),
        );
        return {
          name: c.competitorName,
          placeId: c.competitorPlaceId,
          visitor,
          blog,
          totalGrowth: (visitor ?? 0) + (blog ?? 0),
          spanDays,
          isEstimated: !e.weekAgo,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => (b.totalGrowth ?? 0) - (a.totalGrowth ?? 0));

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
      myWeeklyGrowth,
      competitorWeeklyGrowth: competitorWeeklyGrowth.slice(0, 3),
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
