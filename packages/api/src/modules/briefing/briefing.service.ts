import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { CacheService } from "../../common/cache.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { BRIEFING_SYSTEM_PROMPT } from "../../providers/ai/prompts";

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
    private cache: CacheService,
  ) {}

  // 오늘 브리핑 조회 — Redis 캐시 우선, 미스 시 DB
  async getTodayBriefing(storeId: string) {
    const cacheKey = CacheService.keys.briefingToday(storeId);
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const briefing = await this.prisma.dailyBriefing.findUnique({
      where: { storeId_date: { storeId, date: today } },
    });
    if (!briefing)
      throw new NotFoundException("오늘의 브리핑이 아직 생성되지 않았습니다");

    // 다음 새벽까지 캐시 (TTL 24h)
    await this.cache.set(cacheKey, briefing, 86400);
    return briefing;
  }

  // 브리핑 히스토리
  async getBriefingHistory(storeId: string) {
    return this.prisma.dailyBriefing.findMany({
      where: { storeId },
      orderBy: { date: "desc" },
      take: 30,
    });
  }

  // AI 오늘 장사 브리핑 생성
  async generateDailyBriefing(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        analyses: { take: 2, orderBy: { analyzedAt: "desc" } },
        keywords: { orderBy: { monthlySearchVolume: "desc" }, take: 10 },
        competitors: { take: 5 },
      },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    this.logger.log(`브리핑 생성 시작: ${store.name}`);

    const lastAnalysis = store.analyses[0];
    const prevAnalysis = store.analyses[1];
    const today = new Date();

    // 순위 히스토리 조회 (최근 7일)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const rankHistory = await this.prisma.keywordRankHistory.findMany({
      where: {
        storeId,
        checkedAt: { gte: sevenDaysAgo },
      },
      orderBy: { checkedAt: "desc" },
    });

    // 키워드별 순위 변동 계산
    const rankChanges: Record<string, { current: number | null; previous: number | null; change: number | null }> = {};
    for (const kw of store.keywords) {
      const kwRanks = rankHistory
        .filter((r) => r.keyword === kw.keyword && r.rank !== null)
        .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime());
      if (kwRanks.length >= 2) {
        rankChanges[kw.keyword] = {
          current: kwRanks[0].rank,
          previous: kwRanks[kwRanks.length - 1].rank,
          change: (kwRanks[kwRanks.length - 1].rank ?? 0) - (kwRanks[0].rank ?? 0),
        };
      } else if (kwRanks.length === 1) {
        rankChanges[kw.keyword] = { current: kwRanks[0].rank, previous: null, change: null };
      }
    }

    // 경쟁사 히스토리 조회
    const competitorHistory = await this.prisma.competitorHistory.findMany({
      where: {
        competitor: { storeId },
        recordedAt: { gte: sevenDaysAgo },
      },
      include: { competitor: true },
      orderBy: { recordedAt: "desc" },
    });

    // 경쟁사 변동 요약
    const competitorChanges = store.competitors.map((c) => {
      const history = competitorHistory.filter((h) => h.competitorId === c.id);
      const latest = history[0];
      const oldest = history[history.length - 1];
      return {
        name: c.competitorName,
        currentReviews: c.blogReviewCount ?? 0,
        reviewChange: latest && oldest
          ? (latest.blogReviewCount ?? 0) - (oldest.blogReviewCount ?? 0)
          : 0,
      };
    });

    // 경쟁사 알림 조회 (최근 24시간 내 미읽은 것)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const competitorAlerts = await this.prisma.competitorAlert.findMany({
      where: {
        storeId,
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 시즌 정보 조회
    const seasonalEvents = await this.prisma.seasonalEvent.findMany({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    // 점수 변동
    const scoreChange = lastAnalysis && prevAnalysis
      ? (lastAnalysis.competitiveScore ?? 0) - (prevAnalysis.competitiveScore ?? 0)
      : null;

    // 컨텍스트 구성 (강화된 버전)
    const userPrompt = JSON.stringify({
      today: today.toISOString().split("T")[0],
      dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][today.getDay()],
      dayType: [0, 6].includes(today.getDay()) ? "주말" : today.getDay() === 1 ? "월요일(주간시작)" : today.getDay() === 5 ? "금요일(주말대비)" : "평일",
      store: {
        name: store.name,
        category: store.category,
        district: store.district,
        address: store.address,
        competitiveScore: store.competitiveScore,
        scoreChange,
      },
      latestAnalysis: lastAnalysis
        ? {
            strengths: lastAnalysis.strengths,
            weaknesses: lastAnalysis.weaknesses,
            recommendations: lastAnalysis.recommendations,
            blogReviewCount: lastAnalysis.blogReviewCount,
            receiptReviewCount: lastAnalysis.receiptReviewCount,
          }
        : null,
      keywords: store.keywords.map((kw) => ({
        keyword: kw.keyword,
        trend: kw.trendDirection,
        change: kw.trendPercentage,
        volume: kw.monthlySearchVolume,
        currentRank: kw.currentRank,
        rankChange: rankChanges[kw.keyword] ?? null,
      })),
      competitors: competitorChanges,
      competitorAlerts: competitorAlerts.map((a) => ({
        competitor: a.competitorName,
        type: a.alertType,
        detail: a.detail,
        recommendation: a.aiRecommendation,
      })),
      seasonalEvents: seasonalEvents.map((e) => ({
        name: e.name,
        keywords: e.keywords,
      })),
    });

    // AI 브리핑 생성
    const aiResponse = await this.ai.analyze(BRIEFING_SYSTEM_PROMPT, userPrompt);

    // JSON 파싱 — 실패 시 명시적 에러 (하드코딩 위안 메시지 금지)
    let parsed: any;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);
    } catch (e: any) {
      this.logger.error(
        `브리핑 JSON 파싱 실패 [${store.name}] provider=${aiResponse.provider}: ${e.message}`,
      );
      this.logger.error(`AI 응답 원문 (앞 500자): ${aiResponse.content.slice(0, 500)}`);
      throw new Error(
        `AI 브리핑 응답이 유효한 JSON이 아닙니다 (provider=${aiResponse.provider}). ` +
          `재시도 또는 프롬프트 검토 필요.`,
      );
    }

    // 응답 구조 최소 검증
    if (!parsed.todayActions || !Array.isArray(parsed.todayActions) || parsed.todayActions.length === 0) {
      throw new Error(
        `AI 브리핑 응답에 todayActions 배열이 없거나 비어있음 (provider=${aiResponse.provider})`,
      );
    }

    // 브리핑 저장 (upsert)
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const briefing = await this.prisma.dailyBriefing.upsert({
      where: { storeId_date: { storeId, date: todayDate } },
      update: {
        summary: parsed.greeting || "",
        trends: parsed.trends || [],
        actions: parsed.todayActions || [],
        competitorAlert: parsed.competitorAlert,
        seasonalInfo: parsed.seasonalEvents || null,
        aiModel: aiResponse.provider,
      },
      create: {
        storeId,
        date: todayDate,
        summary: parsed.greeting || "",
        trends: parsed.trends || [],
        actions: parsed.todayActions || [],
        competitorAlert: parsed.competitorAlert,
        seasonalInfo: parsed.seasonalEvents || null,
        aiModel: aiResponse.provider,
      },
    });

    // 캐시에 즉시 반영 (배치 후 사용자 첫 접속 즉시 응답)
    await this.cache.set(
      CacheService.keys.briefingToday(storeId),
      briefing,
      86400,
    );

    this.logger.log(
      `브리핑 생성 완료: ${store.name} (provider: ${aiResponse.provider})`,
    );
    return briefing;
  }
}
