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
    const { problems, actions: rawActions, keywordStrategy } = diagnosis;

    // href sanitize — AI 또는 캐시에 잘못된 경로(`/dashboard/xxx` 등) 들어있어도
    // 프런트 가용 경로만 허용. type 기반 매핑 + 유효 화이트리스트.
    const VALID_HREFS = new Set([
      "/", "/keywords", "/reviews", "/content", "/competitors",
      "/analysis", "/events", "/ingredients", "/foreign-market", "/reports",
    ]);
    const typeToHref = (t: string): string => {
      const low = (t || "").toLowerCase();
      if (low.includes("review")) return "/reviews";
      if (low.includes("keyword")) return "/keywords";
      if (low.includes("blog") || low.includes("content")) return "/content";
      if (low.includes("compet")) return "/competitors";
      if (low.includes("monit") || low.includes("rank")) return "/keywords";
      return "/keywords";
    };
    const topActions = (rawActions ?? []).map((a: any) => ({
      ...a,
      href: VALID_HREFS.has(a.href) ? a.href : typeToHref(a.type),
    }));

    // === 4. 키워드 순위 현황 (상위 8개) ===
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

    // === 4-b. 키워드 분포 (홈 § 1 진단용) ===
    // change 부호: prev - cur. 양수 = 좋아짐(순위 낮아짐), 음수 = 나빠짐
    let rising = 0;
    let flat = 0;
    let falling = 0;
    let weakest: { keyword: string; rank: number } | null = null;
    for (const k of keywordRanks) {
      const c = k.change;
      if (c == null || c === 0) flat++;
      else if (c > 0) rising++;
      else falling++;
      if (k.currentRank != null && (!weakest || k.currentRank > weakest.rank)) {
        weakest = { keyword: k.keyword, rank: k.currentRank };
      }
    }
    const keywordDistribution = { rising, flat, falling, weakest };

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

    // === 6-b. 경쟁 액션 카드 (홈 § 4 용) — "차이 + 원인 + 1탭 액션" ===
    // 가장 공격적인 경쟁사 1개 vs 우리 주간 증감 비교 → 권장 액션
    // dedup: § 2 actions 에 같은 type 있으면 § 4 에서 제외 (사장님 룰)
    const actionTypes = new Set(topActions.map((a: any) => a.type));
    const competitorActions: Array<{
      title: string;
      reason: string;
      ctaLabel: string;
      href: string;
      severity: "info" | "warning" | "critical";
    }> = [];
    const topComp = competitorWeeklyGrowth[0];
    if (topComp && myWeeklyGrowth) {
      const myBlog = myWeeklyGrowth.blog ?? 0;
      const compBlog = topComp.blog ?? 0;
      const myVisitor = myWeeklyGrowth.visitor ?? 0;
      const compVisitor = topComp.visitor ?? 0;
      // 블로그 격차 — 가장 큰 신호
      const blogDuplicate = actionTypes.has("BLOG_CONTENT") || actionTypes.has("CONTENT_REGULAR");
      if (compBlog - myBlog >= 3 && !blogDuplicate) {
        competitorActions.push({
          title: `${topComp.name} 이번 주 블로그 +${compBlog}건`,
          reason: `우리는 ${myBlog}건 — 격차 ${compBlog - myBlog}건`,
          ctaLabel: "AI 블로그 글 작성",
          href: "/content?type=BLOG",
          severity: compBlog - myBlog >= 5 ? "critical" : "warning",
        });
      }
      // 방문자 리뷰 격차
      const reviewDuplicate = actionTypes.has("REVIEW") || actionTypes.has("REVIEW_REPLY");
      if (compVisitor - myVisitor >= 5 && !reviewDuplicate) {
        competitorActions.push({
          title: `${topComp.name} 방문자 리뷰 +${compVisitor}건`,
          reason: `우리는 ${myVisitor}건 — 리뷰 요청 시급`,
          ctaLabel: "리뷰 요청 보내기",
          href: "/reviews",
          severity: compVisitor - myVisitor >= 10 ? "critical" : "warning",
        });
      }
    }

    // === setupProgress 계산 (2026-04-24 진정한 백그라운드 가입용) ===
    // 6단계: 키워드/경쟁사/첫분석/순위체크/30일백필/브리핑
    const hasKeywords = keywords.length > 0;
    const hasCompetitors = competitors.length > 0;
    const hasAnalysis = analysis != null;
    const hasRank = keywords.some((k) => k.currentRank != null);
    // 30일 백필 완료 여부 = 내 매장 DailySnapshot 존재
    const snapshotCount = await this.prisma.storeDailySnapshot.count({
      where: { storeId },
    });
    const hasBackfill = snapshotCount >= 5; // 최소 5일치 이상 있으면 완료로 간주
    const hasBriefing = await this.prisma.dailyBriefing
      .findFirst({ where: { storeId } })
      .then((b) => b != null);

    const steps = [
      { key: "keywords", label: "키워드", done: hasKeywords },
      { key: "competitors", label: "경쟁사", done: hasCompetitors },
      { key: "analysis", label: "첫 분석", done: hasAnalysis },
      { key: "rank", label: "순위 체크", done: hasRank },
      { key: "backfill", label: "30일 추이", done: hasBackfill },
      { key: "briefing", label: "브리핑", done: hasBriefing },
    ];
    const completedCount = steps.filter((s) => s.done).length;
    const setupProgress = {
      total: steps.length,
      completed: completedCount,
      percent: Math.round((completedCount / steps.length) * 100),
      steps,
      inProgress: completedCount < steps.length,
    };

    return {
      store: {
        name: store.name,
        category: store.category,
        address: store.address,
        competitiveScore: store.competitiveScore,
        setupStatus: store.setupStatus,
        setupStep: store.setupStep,
      },
      setupProgress,
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
      keywordDistribution,
      competitorComparison,
      competitorActions,
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
