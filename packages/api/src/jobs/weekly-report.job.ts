import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.service";
import { findAutoAnalysisStores } from "../common/helpers/auto-analysis-targets.helper";
import { NotificationService } from "../modules/notification/notification.service";
import { ActionTrackingService } from "../modules/analysis/action-tracking.service";
import { AIProvider } from "../providers/ai/ai.provider";

/**
 * 주간 마케팅 성적표 배치잡.
 * 매주 월요일 07:30 — 키워드 관리(03:00) + 효과 측정(07:00) 후.
 */
@Injectable()
export class WeeklyReportJob {
  private readonly logger = new Logger(WeeklyReportJob.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private actionTracking: ActionTrackingService,
    private ai: AIProvider,
  ) {}

  @Cron("45 4 * * 1") // UTC 04:45 월 = 한국 월요일 13:45
  async generateWeeklyReports() {
    const stores = await findAutoAnalysisStores(this.prisma, {
      select: { id: true, name: true, userId: true, avgOrderValue: true },
      caller: "WeeklyReportJob",
    });

    this.logger.log(`[월요일 07:30] 주간 성적표 대상 ${stores.length}개 매장`);

    for (const store of stores) {
      try {
        await this.generateReport(store);
      } catch (e: any) {
        this.logger.warn(`[${store.name}] 주간 성적표 실패: ${e.message}`);
      }
    }
  }

  async generateReport(store: { id: string; name: string; userId: string; avgOrderValue: number | null }) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // 1. 순위 변동 집계
    const rankHistory = await this.prisma.keywordRankHistory.findMany({
      where: { storeId: store.id, checkedAt: { gte: weekAgo } },
      orderBy: { checkedAt: "desc" },
    });

    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId: store.id },
      select: { keyword: true, currentRank: true, previousRank: true, trendDirection: true },
    });

    const improved = keywords.filter((k) => k.currentRank && k.previousRank && k.currentRank < k.previousRank);
    const declined = keywords.filter((k) => k.currentRank && k.previousRank && k.currentRank > k.previousRank);

    // 2. 액션 성과
    const actionSummary = await this.actionTracking.getWeeklySummary(store.id);

    // 3. 경쟁사 알림 수
    const competitorAlerts = await this.prisma.competitorAlert.count({
      where: { storeId: store.id, createdAt: { gte: weekAgo } },
    });

    // 4. 리뷰 변동
    const latestAnalysis = await this.prisma.storeAnalysis.findFirst({
      where: { storeId: store.id },
      orderBy: { analyzedAt: "desc" },
      select: { competitiveScore: true, receiptReviewCount: true, blogReviewCount: true },
    });

    // 5. ROI
    const roi = await this.actionTracking.calculateROI(store.id);

    // 6. AI 주간 요약 생성
    let aiSummary = "";
    try {
      const prompt = `주간 마케팅 성과 데이터:
- 매장: ${store.name}
- 순위 상승 키워드: ${improved.length}개 (${improved.map((k) => k.keyword).join(", ") || "없음"})
- 순위 하락 키워드: ${declined.length}개
- 수행한 액션: ${actionSummary.totalActions}건
- 효과 확인된 액션: ${actionSummary.measuredActions}건 중 ${actionSummary.improvedActions}건 긍정적
- 경쟁사 알림: ${competitorAlerts}건
- 경쟁력 점수: ${latestAnalysis?.competitiveScore ?? "미측정"}점
- 추정 추가 매출: ${roi?.additionalRevenue?.toLocaleString() ?? "미측정"}원

이 데이터를 바탕으로 사장님을 위한 주간 성적표를 2-3문장으로 작성해줘.
친근하고 격려하는 톤으로, 구체적인 숫자를 포함해.`;

      const response = await this.ai.generate(
        "너는 자영업 마케팅 매니저다. 사장님에게 주간 성과를 보고한다.",
        prompt,
      );
      aiSummary = response.content.trim().slice(0, 500);
    } catch {}

    // 7. 알림 발송
    const title = `${store.name} 주간 성적표`;
    const highlights = [
      improved.length > 0 ? `순위 상승 ${improved.length}개` : null,
      actionSummary.totalActions > 0 ? `액션 ${actionSummary.totalActions}건 수행` : null,
      roi?.additionalRevenue ? `추정 추가 매출 ${roi.additionalRevenue.toLocaleString()}원` : null,
    ].filter(Boolean).join(" | ");

    await this.notificationService.create(store.userId, {
      type: "WEEKLY_REPORT",
      title,
      message: aiSummary || highlights || "이번 주 활동이 없습니다",
      data: {
        improved: improved.map((k) => k.keyword),
        declined: declined.map((k) => k.keyword),
        actionCount: actionSummary.totalActions,
        competitorAlerts,
        roi: roi?.roi ?? 0,
        score: latestAnalysis?.competitiveScore,
      },
    });

    this.logger.log(`[${store.name}] 주간 성적표 발송: 상승 ${improved.length}, 하락 ${declined.length}, 액션 ${actionSummary.totalActions}건`);
  }
}
