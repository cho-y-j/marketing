import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { BRIEFING_SYSTEM_PROMPT } from "../../providers/ai/prompts";

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
  ) {}

  // 오늘 브리핑 조회
  async getTodayBriefing(storeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const briefing = await this.prisma.dailyBriefing.findUnique({
      where: { storeId_date: { storeId, date: today } },
    });
    if (!briefing)
      throw new NotFoundException("오늘의 브리핑이 아직 생성되지 않았습니다");
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
      seasonalEvents: seasonalEvents.map((e) => ({
        name: e.name,
        keywords: e.keywords,
      })),
    });

    // AI 브리핑 생성
    const aiResponse = await this.ai.analyze(BRIEFING_SYSTEM_PROMPT, userPrompt);

    // JSON 파싱
    let parsed: any;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);
    } catch {
      this.logger.warn("브리핑 JSON 파싱 실패, 기본 응답 생성");
      parsed = {
        greeting: `사장님, 좋은 ${["일", "월", "화", "수", "목", "금", "토"][today.getDay()]}요일이에요!`,
        trends: [],
        competitorAlert: null,
        todayActions: [
          {
            order: 1,
            action: "네이버 플레이스 게시글을 올려보세요",
            reason: "꾸준한 게시글이 검색 노출에 도움이 됩니다",
            howTo: "매장 소식이나 신메뉴를 짧게 소개해보세요",
          },
        ],
        motivation: "오늘도 화이팅이에요!",
      };
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

    this.logger.log(
      `브리핑 생성 완료: ${store.name} (provider: ${aiResponse.provider})`,
    );
    return briefing;
  }
}
