import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchProvider } from "../../providers/naver/naver-search.provider";

/**
 * 블로그 상위노출 분석 엔진
 *
 * 의뢰자 핵심 요구:
 * - 키워드 검색 시 블로그 영역에서 상위노출이 형성되어 있는지
 * - 경쟁사가 어떤 키워드에서 블로그 상위를 점유하고 있는지
 * - 밀어야 할 키워드 / 포기할 키워드 구분
 */

interface BlogCheckResult {
  keyword: string;
  blogExposureCount: number;
  recentBlogRate: number;
  competitorMentionCount: number;
  hasPlaceLink: boolean;
  competitionLevel: string;
  topBlogs: Array<{
    title: string;
    blogName: string;
    date: string;
    link: string;
    isRecent: boolean;
  }>;
  recommendation: string;
  recommendationReason: string;
}

@Injectable()
export class BlogAnalysisService {
  private readonly logger = new Logger(BlogAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private naverSearch: NaverSearchProvider,
  ) {}

  /**
   * 매장의 모든 키워드에 대해 블로그 상위노출 분석 실행
   */
  async analyzeAllKeywords(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        keywords: { orderBy: { monthlySearchVolume: "desc" } },
        competitors: { select: { competitorName: true } },
      },
    });
    if (!store) throw new Error("Store not found");

    const competitorNames = store.competitors.map((c) => c.competitorName);
    const results: BlogCheckResult[] = [];

    for (const kw of store.keywords) {
      try {
        const result = await this.analyzeKeywordBlog(
          kw.keyword,
          store.name,
          competitorNames,
        );
        results.push(result);

        // DB에 저장
        await this.prisma.blogAnalysis.upsert({
          where: {
            id: await this.findExistingId(storeId, kw.keyword),
          },
          create: {
            storeId,
            keyword: kw.keyword,
            blogExposureCount: result.blogExposureCount,
            recentBlogRate: result.recentBlogRate,
            competitorMentionCount: result.competitorMentionCount,
            hasPlaceLink: result.hasPlaceLink,
            competitionLevel: result.competitionLevel,
            topBlogs: result.topBlogs as any,
            recommendation: result.recommendation,
            recommendationReason: result.recommendationReason,
          },
          update: {
            blogExposureCount: result.blogExposureCount,
            recentBlogRate: result.recentBlogRate,
            competitorMentionCount: result.competitorMentionCount,
            hasPlaceLink: result.hasPlaceLink,
            competitionLevel: result.competitionLevel,
            topBlogs: result.topBlogs as any,
            recommendation: result.recommendation,
            recommendationReason: result.recommendationReason,
            analyzedAt: new Date(),
          },
        });

        // API 과부하 방지
        await new Promise((r) => setTimeout(r, 500));
      } catch (e: any) {
        this.logger.warn(`블로그 분석 실패 [${kw.keyword}]: ${e.message}`);
      }
    }

    this.logger.log(`블로그 분석 완료: ${store.name} (${results.length}/${store.keywords.length} 키워드)`);
    return results;
  }

  /**
   * 단일 키워드 블로그 상위노출 분석
   */
  async analyzeKeywordBlog(
    keyword: string,
    storeName: string,
    competitorNames: string[],
  ): Promise<BlogCheckResult> {
    // 네이버 블로그 검색 (상위 10개)
    const blogs = await this.naverSearch.searchBlog(keyword, 10);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 블로그 분석
    const topBlogs = blogs.map((b) => {
      const postDate = this.parseDate(b.postdate);
      const isRecent = postDate >= thirtyDaysAgo;
      return {
        title: this.stripHtml(b.title),
        blogName: b.bloggername,
        date: b.postdate,
        link: b.link,
        isRecent,
      };
    });

    const blogExposureCount = topBlogs.length;
    const recentCount = topBlogs.filter((b) => b.isRecent).length;
    const recentBlogRate = blogExposureCount > 0 ? Math.round((recentCount / blogExposureCount) * 100) : 0;

    // 경쟁사 매장명 언급 체크
    let competitorMentionCount = 0;
    const allText = blogs.map((b) => `${b.title} ${b.description}`).join(" ");
    for (const compName of competitorNames) {
      const normalizedComp = compName.replace(/\s+/g, "");
      if (allText.replace(/\s+/g, "").includes(normalizedComp)) {
        competitorMentionCount++;
      }
    }

    // 플레이스 연결 문맥 체크 (place.naver, map.naver 등)
    const hasPlaceLink = blogs.some(
      (b) =>
        b.description.includes("place.naver") ||
        b.description.includes("map.naver") ||
        b.description.includes("네이버 지도") ||
        b.description.includes("플레이스"),
    );

    // 경쟁 강도 판단
    let competitionLevel: string;
    if (recentCount >= 7) competitionLevel = "VERY_HIGH";
    else if (recentCount >= 5) competitionLevel = "HIGH";
    else if (recentCount >= 3) competitionLevel = "MEDIUM";
    else competitionLevel = "LOW";

    // 전략 추천
    const { recommendation, reason } = this.getRecommendation(
      blogExposureCount,
      recentBlogRate,
      competitorMentionCount,
      competitionLevel,
      storeName,
      allText,
    );

    return {
      keyword,
      blogExposureCount,
      recentBlogRate,
      competitorMentionCount,
      hasPlaceLink,
      competitionLevel,
      topBlogs,
      recommendation,
      recommendationReason: reason,
    };
  }

  /**
   * 전략 추천 로직
   * PUSH: 밀어야 함, HOLD: 현재 유지, SKIP: 포기 후보, DONE: 이미 상위
   */
  private getRecommendation(
    blogCount: number,
    recentRate: number,
    compMentions: number,
    competition: string,
    storeName: string,
    allText: string,
  ): { recommendation: string; reason: string } {
    // 우리 매장이 이미 상위 블로그에 노출
    const normalizedStore = storeName.replace(/\s+/g, "");
    if (allText.replace(/\s+/g, "").includes(normalizedStore)) {
      return {
        recommendation: "DONE",
        reason: `"${storeName}"이 이미 블로그 상위에 노출되고 있습니다. 현재 포지션을 유지하세요.`,
      };
    }

    // 경쟁 너무 심함 + 경쟁사가 점유
    if (competition === "VERY_HIGH" && compMentions >= 3) {
      return {
        recommendation: "SKIP",
        reason: `최근 블로그 ${recentRate}%가 30일 내 작성, 경쟁사 ${compMentions}곳 언급. 경쟁이 과열되어 다른 키워드에 집중하는 것이 효율적입니다.`,
      };
    }

    // 경쟁 낮음 → 공략 기회
    if (competition === "LOW" || competition === "MEDIUM") {
      return {
        recommendation: "PUSH",
        reason: `블로그 경쟁 강도가 ${competition === "LOW" ? "낮아" : "보통이라"} 지금 블로그 콘텐츠를 만들면 상위 진입 가능성이 높습니다.`,
      };
    }

    // 경쟁 높지만 기회 있음
    if (competition === "HIGH" && compMentions < 2) {
      return {
        recommendation: "PUSH",
        reason: `경쟁은 있지만 경쟁 매장의 블로그 점유율은 낮습니다. 꾸준한 블로그 작업으로 역전 가능합니다.`,
      };
    }

    return {
      recommendation: "HOLD",
      reason: `현재 상태를 유지하면서 경쟁 동향을 모니터링하세요.`,
    };
  }

  /**
   * 매장의 블로그 분석 결과 조회
   */
  async getAnalysisResults(storeId: string) {
    return this.prisma.blogAnalysis.findMany({
      where: { storeId },
      orderBy: { analyzedAt: "desc" },
    });
  }

  /**
   * 키워드별 블로그 분석 요약 (대시보드/분석 페이지용)
   */
  async getSummary(storeId: string) {
    const results = await this.prisma.blogAnalysis.findMany({
      where: { storeId },
      orderBy: { analyzedAt: "desc" },
    });

    // 중복 키워드 제거 (최신만)
    const seen = new Set<string>();
    const unique = results.filter((r) => {
      if (seen.has(r.keyword)) return false;
      seen.add(r.keyword);
      return true;
    });

    const pushCount = unique.filter((r) => r.recommendation === "PUSH").length;
    const skipCount = unique.filter((r) => r.recommendation === "SKIP").length;
    const doneCount = unique.filter((r) => r.recommendation === "DONE").length;

    return {
      total: unique.length,
      push: pushCount,
      skip: skipCount,
      done: doneCount,
      hold: unique.length - pushCount - skipCount - doneCount,
      results: unique.map((r) => ({
        keyword: r.keyword,
        blogExposureCount: r.blogExposureCount,
        recentBlogRate: r.recentBlogRate,
        competitorMentionCount: r.competitorMentionCount,
        competitionLevel: r.competitionLevel,
        recommendation: r.recommendation,
        recommendationReason: r.recommendationReason,
      })),
    };
  }

  // 기존 분석 ID 찾기 (upsert용)
  private async findExistingId(storeId: string, keyword: string): Promise<string> {
    const existing = await this.prisma.blogAnalysis.findFirst({
      where: { storeId, keyword },
      select: { id: true },
    });
    return existing?.id || `new_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private parseDate(dateStr: string): Date {
    // "20260414" → Date
    if (dateStr.length === 8) {
      return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
    }
    return new Date(dateStr);
  }

  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, "").trim();
  }
}
