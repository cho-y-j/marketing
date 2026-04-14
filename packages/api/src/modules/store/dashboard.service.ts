import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: { orderBy: { monthlySearchVolume: "desc" } },
        competitors: {
          orderBy: { receiptReviewCount: "desc" },
          take: 10,
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

    // === 2. 부족점 진단 ===
    const problems: Array<{
      type: string;
      title: string;
      description: string;
      severity: "critical" | "warning" | "info";
      metric?: { current: number; target: number; unit: string };
    }> = [];

    // 리뷰 부족
    if (analysis && (analysis.receiptReviewCount ?? 0) < 100) {
      problems.push({
        type: "REVIEW_SHORTAGE",
        title: "방문자 리뷰 부족",
        description: `현재 ${analysis.receiptReviewCount ?? 0}개. 경쟁사 평균 ${Math.round(competitors.reduce((s, c) => s + (c.receiptReviewCount ?? 0), 0) / Math.max(competitors.length, 1))}개.`,
        severity: (analysis.receiptReviewCount ?? 0) < 30 ? "critical" : "warning",
        metric: {
          current: analysis.receiptReviewCount ?? 0,
          target: Math.round(competitors.reduce((s, c) => s + (c.receiptReviewCount ?? 0), 0) / Math.max(competitors.length, 1)),
          unit: "개",
        },
      });
    }

    // 순위 하락 / 순위 없음
    if (rankedKeywords.length === 0 && keywords.length > 0) {
      problems.push({
        type: "NO_RANKING",
        title: "검색 순위 미확인",
        description: "아직 키워드 순위가 확인되지 않았습니다. 순위 체크를 실행하세요.",
        severity: "warning",
      });
    } else if (avgRank && avgRank > 50) {
      problems.push({
        type: "LOW_RANKING",
        title: "검색 순위 낮음",
        description: `주요 키워드 평균 ${avgRank}위. 상위 노출을 위해 개선이 필요합니다.`,
        severity: "critical",
        metric: { current: avgRank, target: 10, unit: "위" },
      });
    }

    // 블로그 리뷰 부족
    if (analysis && (analysis.blogReviewCount ?? 0) < 50) {
      const avgCompBlog = competitors.length > 0
        ? Math.round(competitors.reduce((s, c) => s + (c.blogReviewCount ?? 0), 0) / competitors.length)
        : 0;
      if (avgCompBlog > (analysis.blogReviewCount ?? 0) * 2) {
        problems.push({
          type: "BLOG_SHORTAGE",
          title: "블로그 노출 부족",
          description: `블로그 리뷰 ${analysis.blogReviewCount ?? 0}개. 경쟁사 평균 ${avgCompBlog}개로 ${Math.round(avgCompBlog / Math.max(analysis.blogReviewCount ?? 1, 1))}배 차이.`,
          severity: "warning",
          metric: {
            current: analysis.blogReviewCount ?? 0,
            target: avgCompBlog,
            unit: "개",
          },
        });
      }
    }

    // === 3. 오늘의 액션 3개 ===
    const actions: Array<{
      type: string;
      title: string;
      description: string;
      href: string;
      priority: number;
    }> = [];

    // 리뷰 부족이면 리뷰 확보 액션
    if (problems.find((p) => p.type === "REVIEW_SHORTAGE")) {
      actions.push({
        type: "REVIEW",
        title: "리뷰 확보하기",
        description: "방문자 리뷰를 늘려야 순위가 올라갑니다",
        href: "/reviews",
        priority: 10,
      });
    }

    // 순위 낮으면 키워드 전략 액션
    if (problems.find((p) => p.type === "LOW_RANKING" || p.type === "NO_RANKING")) {
      actions.push({
        type: "KEYWORD",
        title: "키워드 전략 점검",
        description: "현재 키워드 순위를 확인하고 전략을 조정하세요",
        href: "/keywords",
        priority: 9,
      });
    }

    // 블로그 부족이면 콘텐츠 생성 액션
    if (problems.find((p) => p.type === "BLOG_SHORTAGE")) {
      actions.push({
        type: "CONTENT",
        title: "블로그 콘텐츠 만들기",
        description: "AI가 블로그 글을 자동 생성해드립니다",
        href: "/content",
        priority: 8,
      });
    }

    // 경쟁사 분석 액션 (항상)
    if (actions.length < 3) {
      actions.push({
        type: "COMPETITOR",
        title: "경쟁사 동향 확인",
        description: "경쟁 매장의 리뷰/순위 변화를 확인하세요",
        href: "/competitors",
        priority: 5,
      });
    }

    // 분석 실행 (분석 없을 때)
    if (!analysis && actions.length < 3) {
      actions.push({
        type: "ANALYSIS",
        title: "AI 분석 실행하기",
        description: "매장 경쟁력을 AI로 분석합니다",
        href: "/analysis",
        priority: 7,
      });
    }

    // 우선순위 정렬 + 3개 제한
    actions.sort((a, b) => b.priority - a.priority);
    const topActions = actions.slice(0, 3);

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
      problems,
      actions: topActions,
      keywordRanks,
      competitorComparison,
      myMetrics: analysis
        ? {
            receiptReviewCount: analysis.receiptReviewCount,
            blogReviewCount: analysis.blogReviewCount,
            saveCount: analysis.saveCount,
            trafficScore: analysis.trafficScore,
            engagementScore: analysis.engagementScore,
            satisfactionScore: analysis.satisfactionScore,
          }
        : null,
    };
  }
}
