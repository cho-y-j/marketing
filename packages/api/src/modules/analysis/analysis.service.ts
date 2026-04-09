import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { CacheService } from "../../common/cache.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { ANALYSIS_SYSTEM_PROMPT } from "../../providers/ai/prompts";
import { PlaceIndexService } from "./place-index.service";

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
    private searchad: NaverSearchadProvider,
    private naverPlace: NaverPlaceProvider,
    private cache: CacheService,
    private placeIndex: PlaceIndexService,
  ) {}

  // 최신 분석 결과 조회 — Redis 캐시 우선
  async getLatestAnalysis(storeId: string) {
    const cacheKey = CacheService.keys.analysisLatest(storeId);
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const analysis = await this.prisma.storeAnalysis.findFirst({
      where: { storeId },
      orderBy: { analyzedAt: "desc" },
    });
    if (!analysis) throw new NotFoundException("분석 결과가 없습니다");

    await this.cache.set(cacheKey, analysis, 86400);
    return analysis;
  }

  // 분석 히스토리
  async getAnalysisHistory(storeId: string) {
    return this.prisma.storeAnalysis.findMany({
      where: { storeId },
      orderBy: { analyzedAt: "desc" },
      take: 30,
    });
  }

  // 경쟁력 점수 조회
  async getCompetitiveScore(storeId: string) {
    const analysis = await this.getLatestAnalysis(storeId);
    return {
      score: analysis.competitiveScore,
      analyzedAt: analysis.analyzedAt,
    };
  }

  // AI 매장 종합 분석
  async analyzeStore(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        keywords: true,
        competitors: true,
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
      },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    this.logger.log(`AI 분석 시작: ${store.name}`);

    // 내 매장 실데이터 수집 (리뷰 수 + 검색량)
    const liveData = await this.collectMyStoreData(
      store.name,
      store.naverPlaceId ?? undefined,
    );
    this.logger.log(
      `내 매장 실데이터 [${liveData.source}]: 영수증=${liveData.receiptReviewCount} 블로그=${liveData.blogReviewCount} 검색=${liveData.dailySearchVolume}/일${
        liveData.error ? ` (error=${liveData.error})` : ""
      }`,
    );

    // 데이터 소스가 'failed' 이고 직전 분석도 없으면 분석 중단 — 0 채워서 가짜 점수 만드는 것 금지
    const lastAnalysisGuard = store.analyses[0];
    if (liveData.source === "failed" && !lastAnalysisGuard) {
      throw new NotFoundException(
        `매장 실데이터 수집 실패 — Chrome/Playwright 또는 네이버 페이지 접근 불가. 사유: ${liveData.error}`,
      );
    }

    // 순위 히스토리 조회
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const rankHistory = await this.prisma.keywordRankHistory.findMany({
      where: { storeId, checkedAt: { gte: sevenDaysAgo } },
      orderBy: { checkedAt: "desc" },
    });

    // 데이터 컨텍스트 구성 (강화)
    const lastAnalysis = store.analyses[0];

    // 실데이터 우선, 없으면 직전 분석. null 은 명시적으로 null 로 전달 (0 으로 위장 금지)
    const pick = <T>(live: T | null, prev: T | null | undefined): T | null =>
      live !== null && live !== undefined
        ? live
        : prev !== null && prev !== undefined
          ? prev
          : null;

    const finalReceiptReviews = pick(liveData.receiptReviewCount, lastAnalysis?.receiptReviewCount);
    const finalBlogReviews = pick(liveData.blogReviewCount, lastAnalysis?.blogReviewCount);
    const finalDailySearch = pick(liveData.dailySearchVolume, lastAnalysis?.dailySearchVolume);
    const finalSaveCount = pick(liveData.saveCount, lastAnalysis?.saveCount);

    const userPrompt = JSON.stringify({
      store: {
        name: store.name,
        category: store.category,
        district: store.district,
        address: store.address,
        receiptReviews: finalReceiptReviews,
        blogReviews: finalBlogReviews,
        dailySearch: finalDailySearch,
        saveCount: finalSaveCount,
        dataSource: liveData.source,
        dataError: liveData.error ?? null,
      },
      keywords: store.keywords.map((kw) => ({
        keyword: kw.keyword,
        monthlyVolume: kw.monthlySearchVolume,
        trend: kw.trendDirection,
        change: kw.trendPercentage,
        currentRank: kw.currentRank,
        previousRank: kw.previousRank,
      })),
      competitors: store.competitors.map((c) => ({
        name: c.competitorName,
        blogReviews: c.blogReviewCount,
        receiptReviews: c.receiptReviewCount,
        dailySearch: c.dailySearchVolume,
      })),
      rankHistory: rankHistory.slice(0, 20).map((r) => ({
        keyword: r.keyword,
        rank: r.rank,
        date: r.checkedAt.toISOString().split("T")[0],
      })),
    });

    // AI 분석 호출
    const aiResponse = await this.ai.analyze(ANALYSIS_SYSTEM_PROMPT, userPrompt);

    // JSON 파싱 — 실패 시 명시적 에러
    let parsed: any;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);
    } catch (e: any) {
      this.logger.error(
        `분석 JSON 파싱 실패 [${store.name}] provider=${aiResponse.provider}: ${e.message}`,
      );
      this.logger.error(`AI 응답 원문 (앞 500자): ${aiResponse.content.slice(0, 500)}`);
      throw new Error(
        `AI 분석 응답이 유효한 JSON이 아닙니다 (provider=${aiResponse.provider})`,
      );
    }
    if (typeof parsed.competitiveScore !== "number") {
      throw new Error(
        `AI 분석 응답에 competitiveScore 가 없음 (provider=${aiResponse.provider})`,
      );
    }

    // 경쟁력 점수 (5가지 지표 가중치)
    const score = this.calculateFinalScore(parsed, lastAnalysis, store.competitors, store.keywords, rankHistory);

    // 분석 결과 저장 — null 은 null 로 저장 (DB 컬럼 모두 nullable)
    const analysis = await this.prisma.storeAnalysis.create({
      data: {
        storeId,
        receiptReviewCount: finalReceiptReviews,
        blogReviewCount: finalBlogReviews,
        dailySearchVolume: finalDailySearch,
        saveCount: finalSaveCount,
        aiAnalysis: parsed,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        recommendations: parsed.recommendations || [],
        competitiveScore: score,
      },
    });

    // 매장 점수 업데이트
    await this.prisma.store.update({
      where: { id: storeId },
      data: { competitiveScore: score, lastAnalyzedAt: new Date() },
    });

    // N1/N2/N3 자체 산출 지수 채우기
    try {
      await this.placeIndex.computeAndPersist(storeId);
    } catch (e: any) {
      this.logger.warn(`N1/N2/N3 산출 실패: ${e.message}`);
    }

    // 캐시 무효화 + 새 결과 즉시 반영
    const refreshed = await this.prisma.storeAnalysis.findUnique({
      where: { id: analysis.id },
    });
    await this.cache.set(
      CacheService.keys.analysisLatest(storeId),
      refreshed ?? analysis,
      86400,
    );

    this.logger.log(`AI 분석 완료: ${store.name} (점수: ${score}, provider: ${aiResponse.provider})`);
    return refreshed ?? analysis;
  }

  /**
   * 경쟁력 점수 산출 — 5가지 지표 가중치
   * 리뷰(25%) + 순위(25%) + 검색량(20%) + 콘텐츠(15%) + AI(15%)
   */
  private calculateFinalScore(
    aiResult: any,
    lastAnalysis: any,
    competitors: any[],
    keywords: any[],
    rankHistory: any[],
  ): number {
    const aiScore = Math.min(100, Math.max(0, aiResult.competitiveScore || 50));

    // 1) 리뷰 점수 (25%) — 경쟁사 대비 리뷰 수
    let reviewScore = 50;
    if (lastAnalysis && competitors.length > 0) {
      const myReviews = (lastAnalysis.blogReviewCount || 0) + (lastAnalysis.receiptReviewCount || 0);
      const avgCompReviews = competitors.reduce((sum: number, c: any) =>
        sum + (c.blogReviewCount || 0) + (c.receiptReviewCount || 0), 0) / competitors.length;
      if (avgCompReviews > 0) {
        const ratio = myReviews / avgCompReviews;
        reviewScore = Math.min(100, Math.round(ratio * 60 + 20));
      } else {
        reviewScore = myReviews > 0 ? 70 : 30;
      }
    }

    // 2) 순위 점수 (25%) — 키워드 평균 순위 기반
    let rankScore = 50;
    const rankedKeywords = keywords.filter((k: any) => k.currentRank != null && k.currentRank > 0);
    if (rankedKeywords.length > 0) {
      const avgRank = rankedKeywords.reduce((s: number, k: any) => s + k.currentRank, 0) / rankedKeywords.length;
      // 1위=100점, 5위=80점, 10위=60점, 20위=40점, 50위이상=10점
      if (avgRank <= 1) rankScore = 100;
      else if (avgRank <= 3) rankScore = 90;
      else if (avgRank <= 5) rankScore = 80;
      else if (avgRank <= 10) rankScore = 65;
      else if (avgRank <= 20) rankScore = 45;
      else if (avgRank <= 30) rankScore = 30;
      else rankScore = 15;

      // 순위 상승 보너스
      const improving = rankedKeywords.filter((k: any) =>
        k.previousRank && k.currentRank < k.previousRank).length;
      const declining = rankedKeywords.filter((k: any) =>
        k.previousRank && k.currentRank > k.previousRank).length;
      rankScore += (improving - declining) * 3;
      rankScore = Math.min(100, Math.max(0, rankScore));
    }

    // 3) 검색량 점수 (20%) — 월 검색량 총합
    let searchScore = 50;
    const totalVolume = keywords.reduce((s: number, k: any) => s + (k.monthlySearchVolume || 0), 0);
    if (totalVolume > 100000) searchScore = 95;
    else if (totalVolume > 50000) searchScore = 85;
    else if (totalVolume > 20000) searchScore = 70;
    else if (totalVolume > 10000) searchScore = 60;
    else if (totalVolume > 5000) searchScore = 50;
    else if (totalVolume > 1000) searchScore = 35;
    else searchScore = 20;

    // 4) 콘텐츠 활동 점수 (15%) — 키워드 다양성 + 순위 체크 활성도
    let contentScore = 50;
    const kwCount = keywords.length;
    const checkedCount = rankedKeywords.length;
    const recentRankChecks = rankHistory.length;
    contentScore = Math.min(100,
      (kwCount >= 10 ? 30 : kwCount * 3) +
      (checkedCount >= 5 ? 30 : checkedCount * 6) +
      (recentRankChecks >= 10 ? 40 : recentRankChecks * 4)
    );

    // 5) AI 판단 점수 (15%)
    const aiJudge = aiScore;

    // 최종 점수
    const finalScore = Math.round(
      reviewScore * 0.25 +
      rankScore * 0.25 +
      searchScore * 0.20 +
      contentScore * 0.15 +
      aiJudge * 0.15
    );

    this.logger.log(
      `점수 산출: 리뷰=${reviewScore} 순위=${rankScore} 검색량=${searchScore} 콘텐츠=${contentScore} AI=${aiJudge} → 최종=${finalScore}`,
    );

    return Math.min(100, Math.max(0, finalScore));
  }

  /**
   * 내 매장 실데이터 수집 (네이버 API 기반).
   * Chrome/Playwright 불필요 — 서버 환경에 관계없이 동작.
   *
   * 결과 source:
   *  - 'live'    : 모든 핵심 지표 추출 성공
   *  - 'partial' : 일부 지표만 추출 성공 (나머지는 null)
   *  - 'failed'  : 추출 0 — caller 가 lastAnalysis 폴백 또는 에러 처리 필요
   *
   * 절대 0 으로 가짜 채우지 않는다. null 로 반환해서 호출자가 명시적으로 처리.
   */
  private async collectMyStoreData(
    storeName: string,
    naverPlaceId?: string,
  ): Promise<{
    receiptReviewCount: number | null;
    blogReviewCount: number | null;
    dailySearchVolume: number | null;
    saveCount: number | null;
    source: "live" | "partial" | "failed";
    error?: string;
  }> {
    let receiptReviewCount: number | null = null;
    let blogReviewCount: number | null = null;
    let dailySearchVolume: number | null = null;
    let saveCount: number | null = null;
    let dataError: string | undefined;

    // 1. 검색광고 API → 일 검색량
    try {
      const stats = await this.searchad.getKeywordStats([
        storeName.replace(/\s+/g, ""),
      ]);
      if (stats.length > 0) {
        dailySearchVolume = Math.round(
          this.searchad.getTotalMonthlySearch(stats[0]) / 30,
        );
      }
    } catch (e: any) {
      this.logger.warn(`검색광고 API 실패 [${storeName}]: ${e.message}`);
    }

    // 2. 네이버 맵 API → 리뷰 수 + 저장 수 (Chrome 불필요)
    try {
      const placeInfo = naverPlaceId
        ? await this.naverPlace.getPlaceDetail(naverPlaceId)
        : await this.naverPlace.searchAndGetPlaceInfo(storeName);

      if (placeInfo) {
        if (placeInfo.visitorReviewCount != null && placeInfo.visitorReviewCount > 0) {
          receiptReviewCount = placeInfo.visitorReviewCount;
        }
        if (placeInfo.blogReviewCount != null && placeInfo.blogReviewCount > 0) {
          blogReviewCount = placeInfo.blogReviewCount;
        }
        if (placeInfo.saveCount != null && placeInfo.saveCount > 0) {
          saveCount = placeInfo.saveCount;
        }
        this.logger.log(
          `네이버 API 데이터: ${storeName} — 방문자=${receiptReviewCount} 블로그=${blogReviewCount} 저장=${saveCount}`,
        );
      } else {
        dataError = "naver_place_api_no_result";
        this.logger.warn(`[${storeName}] 네이버 API에서 매장 정보를 찾을 수 없음`);
      }
    } catch (e: any) {
      dataError = `naver_api:${e.message}`;
      this.logger.warn(`네이버 API 실패 [${storeName}]: ${e.message}`);
    }

    // source 판정
    const filledCore =
      [receiptReviewCount, blogReviewCount].filter((v) => v !== null).length;
    let source: "live" | "partial" | "failed";
    if (filledCore === 2) source = "live";
    else if (filledCore === 1 || dailySearchVolume !== null) source = "partial";
    else source = "failed";

    return {
      receiptReviewCount,
      blogReviewCount,
      dailySearchVolume,
      saveCount,
      source,
      error: dataError,
    };
  }
}
