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
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: { orderBy: { monthlySearchVolume: "desc" }, take: 5 },
        competitors: { take: 3 },
      },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    this.logger.log(`브리핑 생성 시작: ${store.name}`);

    const lastAnalysis = store.analyses[0];
    const today = new Date();

    // 시즌 정보 조회
    const seasonalEvents = await this.prisma.seasonalEvent.findMany({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    // 컨텍스트 구성
    const userPrompt = JSON.stringify({
      today: today.toISOString().split("T")[0],
      dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][today.getDay()],
      store: {
        name: store.name,
        category: store.category,
        district: store.district,
        competitiveScore: store.competitiveScore,
      },
      latestAnalysis: lastAnalysis
        ? {
            strengths: lastAnalysis.strengths,
            weaknesses: lastAnalysis.weaknesses,
            recommendations: lastAnalysis.recommendations,
          }
        : null,
      keywords: store.keywords.map((kw) => ({
        keyword: kw.keyword,
        trend: kw.trendDirection,
        change: kw.trendPercentage,
        volume: kw.monthlySearchVolume,
      })),
      competitors: store.competitors.map((c) => ({
        name: c.competitorName,
        reviews: c.blogReviewCount,
      })),
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
