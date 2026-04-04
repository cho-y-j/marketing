import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { ANALYSIS_SYSTEM_PROMPT } from "../../providers/ai/prompts";
import { chromium } from "playwright-core";
import { execFileSync } from "child_process";

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly chromePath: string;

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
    private searchad: NaverSearchadProvider,
  ) {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
    ];
    let found = "";
    for (const p of paths) {
      try { execFileSync("test", ["-f", p]); found = p; break; } catch {}
    }
    this.chromePath = found;
  }

  // 최신 분석 결과 조회
  async getLatestAnalysis(storeId: string) {
    const analysis = await this.prisma.storeAnalysis.findFirst({
      where: { storeId },
      orderBy: { analyzedAt: "desc" },
    });
    if (!analysis) throw new NotFoundException("분석 결과가 없습니다");
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
    const liveData = await this.collectMyStoreData(store.name);
    this.logger.log(`내 매장 실데이터: 영수증=${liveData.receiptReviewCount} 블로그=${liveData.blogReviewCount} 검색=${liveData.dailySearchVolume}/일`);

    // 순위 히스토리 조회
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const rankHistory = await this.prisma.keywordRankHistory.findMany({
      where: { storeId, checkedAt: { gte: sevenDaysAgo } },
      orderBy: { checkedAt: "desc" },
    });

    // 데이터 컨텍스트 구성 (강화)
    const lastAnalysis = store.analyses[0];
    const userPrompt = JSON.stringify({
      store: {
        name: store.name,
        category: store.category,
        district: store.district,
        address: store.address,
        receiptReviews: liveData.receiptReviewCount || lastAnalysis?.receiptReviewCount || 0,
        blogReviews: liveData.blogReviewCount || lastAnalysis?.blogReviewCount || 0,
        dailySearch: liveData.dailySearchVolume || lastAnalysis?.dailySearchVolume || 0,
        saveCount: liveData.saveCount || lastAnalysis?.saveCount || 0,
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

    // JSON 파싱
    let parsed: any;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);
    } catch {
      this.logger.warn("AI 응답 JSON 파싱 실패, 원본 저장");
      parsed = {
        competitiveScore: 50,
        summary: aiResponse.content.slice(0, 200),
        strengths: [],
        weaknesses: [],
        recommendations: [],
      };
    }

    // 경쟁력 점수 (5가지 지표 가중치)
    const score = this.calculateFinalScore(parsed, lastAnalysis, store.competitors, store.keywords, rankHistory);

    // 분석 결과 저장
    const analysis = await this.prisma.storeAnalysis.create({
      data: {
        storeId,
        receiptReviewCount: liveData.receiptReviewCount || lastAnalysis?.receiptReviewCount || 0,
        blogReviewCount: liveData.blogReviewCount || lastAnalysis?.blogReviewCount || 0,
        dailySearchVolume: liveData.dailySearchVolume || lastAnalysis?.dailySearchVolume || 0,
        saveCount: liveData.saveCount || lastAnalysis?.saveCount || 0,
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

    this.logger.log(`AI 분석 완료: ${store.name} (점수: ${score}, provider: ${aiResponse.provider})`);
    return analysis;
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

  // 내 매장 실데이터 수집 (Playwright + 검색광고 API)
  private async collectMyStoreData(storeName: string): Promise<{
    receiptReviewCount: number;
    blogReviewCount: number;
    dailySearchVolume: number;
    saveCount: number;
  }> {
    let receiptReviewCount = 0;
    let blogReviewCount = 0;
    let dailySearchVolume = 0;
    let saveCount = 0;

    // 1. 검색광고 API로 일 검색량
    try {
      const stats = await this.searchad.getKeywordStats([storeName.replace(/\s+/g, "")]);
      if (stats.length > 0) {
        dailySearchVolume = Math.round(this.searchad.getTotalMonthlySearch(stats[0]) / 30);
      }
    } catch {}

    // 2. Playwright로 리뷰 수 스크래핑
    if (this.chromePath) {
      try {
        const browser = await chromium.launch({
          headless: true,
          executablePath: this.chromePath,
          args: ["--no-sandbox"],
        });
        const page = await browser.newPage();
        await page.goto(
          `https://search.naver.com/search.naver?query=${encodeURIComponent(storeName)}`,
          { waitUntil: "networkidle", timeout: 15000 },
        );
        const html = await page.content();
        await browser.close();

        // 영수증(방문자) 리뷰 수
        const reviewPatterns = [
          /"reviewCount":(\d+)/,
          /"totalReviewCount":(\d+)/,
          /"visitorReviewCount":(\d+)/,
          /리뷰\s*(\d[\d,]*)/,
          /방문자리뷰\s*(\d[\d,]*)/,
        ];
        for (const p of reviewPatterns) {
          const m = html.match(p);
          if (m) { receiptReviewCount = parseInt(m[1].replace(/,/g, "")); break; }
        }

        // 블로그 리뷰 수
        const blogPatterns = [
          /"blogReviewCount":(\d+)/,
          /블로그리뷰\s*(\d[\d,]*)/,
          /블로그\s*(\d[\d,]*)/,
        ];
        for (const p of blogPatterns) {
          const m = html.match(p);
          if (m) { blogReviewCount = parseInt(m[1].replace(/,/g, "")); break; }
        }

        // 저장 수
        const savePatterns = [
          /"saveCount":(\d+)/,
          /저장\s*(\d[\d,]*)/,
        ];
        for (const p of savePatterns) {
          const m = html.match(p);
          if (m) { saveCount = parseInt(m[1].replace(/,/g, "")); break; }
        }
      } catch (e: any) {
        this.logger.warn(`내 매장 스크래핑 실패: ${e.message}`);
      }
    }

    return { receiptReviewCount, blogReviewCount, dailySearchVolume, saveCount };
  }
}
