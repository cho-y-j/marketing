import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.service";
import { findAutoAnalysisStores } from "../common/helpers/auto-analysis-targets.helper";
import { CompetitorService } from "../modules/competitor/competitor.service";
import { NotificationService } from "../modules/notification/notification.service";
import { AIProvider } from "../providers/ai/ai.provider";

/**
 * 경쟁사 데이터 갱신 배치잡.
 * 매일 04:30 — 분석(04:00) 후, 순위 체크(05:00) 전.
 *
 * 각 매장의 경쟁사 데이터를 갱신하고:
 *  1. CompetitorHistory에 일별 스냅샷 저장
 *  2. 리뷰 급증 감지 시 AI 대응 추천 생성
 *  3. CompetitorAlert에 저장 → 브리핑에서 참조
 *  4. 사장님에게 알림
 */
@Injectable()
export class CompetitorRefreshJob {
  private readonly logger = new Logger(CompetitorRefreshJob.name);

  constructor(
    private prisma: PrismaService,
    private competitorService: CompetitorService,
    private notificationService: NotificationService,
    private ai: AIProvider,
  ) {}

  @Cron("10 4 * * *") // UTC 04:10 = 한국 13:10 (분석 전에 경쟁사 데이터 갱신)
  async refreshAllCompetitors() {
    const stores = await findAutoAnalysisStores(this.prisma, {
      select: { id: true, name: true, userId: true },
      caller: "CompetitorRefreshJob",
    });

    this.logger.log(`[04:30] 경쟁사 갱신 대상 ${stores.length}개 매장`);

    for (const store of stores) {
      try {
        const result = await this.competitorService.refreshAll(store.id);
        this.logger.log(
          `[${store.name}] 경쟁사 ${result.updated}/${result.total}개 갱신, 변동 ${result.changes.length}건`,
        );

        // 변동 감지 → AI 대응 추천 생성 + 알림
        for (const change of result.changes) {
          let aiRecommendation: string | null = null;

          // AI 대응 추천 생성
          try {
            aiRecommendation = await this.generateCounterRecommendation(
              store.name,
              change.name,
              change.type,
              change.detail,
            );
          } catch (e: any) {
            this.logger.warn(`AI 대응 추천 생성 실패: ${e.message}`);
          }

          // CompetitorAlert에 저장 (브리핑에서 참조)
          await this.prisma.competitorAlert.create({
            data: {
              storeId: store.id,
              competitorName: change.name,
              alertType: change.type,
              detail: change.detail,
              aiRecommendation,
            },
          });

          // 사용자 알림
          const message = aiRecommendation
            ? `${change.detail} — 대응: ${aiRecommendation.slice(0, 100)}`
            : change.detail;
          await this.notificationService.create(store.userId, {
            type: "COMPETITOR_ALERT",
            title: `경쟁사 "${change.name}" 리뷰 급증!`,
            message,
            data: { ...change, aiRecommendation },
          });
          this.logger.log(`[${store.name}] 경쟁사 알림: ${change.name} — ${change.detail}`);
        }
      } catch (e: any) {
        this.logger.warn(`[${store.name}] 경쟁사 갱신 실패: ${e.message}`);
      }

      // 매장 간 1초 딜레이 (API 부하 방지)
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // AI 대응 추천 생성
  private async generateCounterRecommendation(
    storeName: string,
    competitorName: string,
    alertType: string,
    detail: string,
  ): Promise<string> {
    const prompt = `경쟁사 변동 알림:
- 내 매장: ${storeName}
- 경쟁사: ${competitorName}
- 변동 유형: ${alertType === "REVIEW_SURGE" ? "방문자 리뷰 급증" : "블로그 리뷰 급증"}
- 상세: ${detail}

이 상황에서 내 매장이 취할 수 있는 즉각적인 대응 액션 1가지를 추천해줘.

규칙:
1. 오늘 당장 실행 가능한 것 (5분 이내)
2. 구체적으로 (예: "네이버 플레이스에 점심 특선 소식 올리기", "리뷰 이벤트 시작하기")
3. 한 문장으로

대응 액션만 답해:`;

    const response = await this.ai.generate(
      "너는 자영업 마케팅 전문가다. 경쟁사 움직임에 대한 즉각 대응을 추천한다.",
      prompt,
    );

    return response.content.replace(/^["']|["']$/g, "").trim().slice(0, 300);
  }
}
