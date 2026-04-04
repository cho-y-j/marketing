import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { ANALYSIS_SYSTEM_PROMPT } from "../../providers/ai/prompts";

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
  ) {}

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

    // 데이터 컨텍스트 구성
    const lastAnalysis = store.analyses[0];
    const userPrompt = JSON.stringify({
      store: {
        name: store.name,
        category: store.category,
        district: store.district,
        receiptReviews: lastAnalysis?.receiptReviewCount || 0,
        blogReviews: lastAnalysis?.blogReviewCount || 0,
        dailySearch: lastAnalysis?.dailySearchVolume || 0,
        saveCount: lastAnalysis?.saveCount || 0,
      },
      keywords: store.keywords.map((kw) => ({
        keyword: kw.keyword,
        monthlyVolume: kw.monthlySearchVolume,
        trend: kw.trendDirection,
        change: kw.trendPercentage,
      })),
      competitors: store.competitors.map((c) => ({
        name: c.competitorName,
        blogReviews: c.blogReviewCount,
        dailySearch: c.dailySearchVolume,
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

    // 경쟁력 점수 (AI 점수 + 가중치 보정)
    const score = this.calculateFinalScore(parsed, lastAnalysis, store.competitors);

    // 분석 결과 저장
    const analysis = await this.prisma.storeAnalysis.create({
      data: {
        storeId,
        receiptReviewCount: lastAnalysis?.receiptReviewCount,
        blogReviewCount: lastAnalysis?.blogReviewCount,
        dailySearchVolume: lastAnalysis?.dailySearchVolume,
        saveCount: lastAnalysis?.saveCount,
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

  // 경쟁력 점수 산출 (AI 점수 + 데이터 기반 가중치)
  private calculateFinalScore(
    aiResult: any,
    lastAnalysis: any,
    competitors: any[],
  ): number {
    const aiScore = aiResult.competitiveScore || 50;

    if (!lastAnalysis || competitors.length === 0) return aiScore;

    // 경쟁사 평균 대비 비율 계산
    const avgCompReviews =
      competitors.reduce((sum, c) => sum + (c.blogReviewCount || 0), 0) /
      competitors.length;
    const myReviews = lastAnalysis.blogReviewCount || 0;
    const reviewRatio = avgCompReviews > 0 ? myReviews / avgCompReviews : 1;

    // AI 점수(70%) + 데이터 보정(30%)
    const dataScore = Math.min(100, Math.round(reviewRatio * 50 + 25));
    return Math.round(aiScore * 0.7 + dataScore * 0.3);
  }
}
