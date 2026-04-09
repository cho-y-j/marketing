import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { ContentService } from "../content/content.service";
import { ReviewService } from "../review/review.service";
import { ActionTrackingService } from "../analysis/action-tracking.service";
import { NotificationService } from "../notification/notification.service";

/**
 * AI 자동 실행 파이프라인.
 *
 * 흐름:
 *  1. AI/배치잡이 PendingAction 생성 (PENDING 상태)
 *  2. 자동모드 ON → 즉시 APPROVED → 실행
 *  3. 자동모드 OFF → 사장님 알림 → [승인] 버튼 → 실행
 *  4. 실행 결과 → ActionLog에 기록 → 7일 후 효과 측정
 */
@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);

  constructor(
    private prisma: PrismaService,
    private contentService: ContentService,
    private reviewService: ReviewService,
    private actionTracking: ActionTrackingService,
    private notificationService: NotificationService,
  ) {}

  // 대기 중인 액션 생성
  async createPendingAction(
    storeId: string,
    data: {
      actionType: string;
      title: string;
      description: string;
      data?: any;
    },
  ) {
    // 자동화 설정 확인
    const settings = await this.getOrCreateSettings(storeId);
    const autoExecute = this.shouldAutoExecute(data.actionType, settings);

    const action = await this.prisma.pendingAction.create({
      data: {
        storeId,
        actionType: data.actionType,
        title: data.title,
        description: data.description,
        data: data.data,
        autoExecute,
        status: autoExecute ? "APPROVED" : "PENDING",
      },
    });

    if (autoExecute) {
      // 자동 모드 → 즉시 실행
      await this.executeAction(action.id);
    } else {
      // 수동 모드 → 사장님에게 알림
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { userId: true },
      });
      if (store) {
        await this.notificationService.create(store.userId, {
          type: "ACTION_PENDING",
          title: `AI 추천: ${data.title}`,
          message: "승인하면 즉시 실행됩니다",
          data: { actionId: action.id, actionType: data.actionType },
        });
      }
    }

    return action;
  }

  // 사장님 승인
  async approveAction(storeId: string, actionId: string) {
    const action = await this.prisma.pendingAction.findFirst({
      where: { id: actionId, storeId, status: "PENDING" },
    });
    if (!action) throw new NotFoundException("대기 중인 액션을 찾을 수 없습니다");

    await this.prisma.pendingAction.update({
      where: { id: actionId },
      data: { status: "APPROVED" },
    });

    return this.executeAction(actionId);
  }

  // 사장님 거절
  async rejectAction(storeId: string, actionId: string) {
    const action = await this.prisma.pendingAction.findFirst({
      where: { id: actionId, storeId, status: "PENDING" },
    });
    if (!action) throw new NotFoundException("대기 중인 액션을 찾을 수 없습니다");

    return this.prisma.pendingAction.update({
      where: { id: actionId },
      data: { status: "REJECTED", rejectedAt: new Date() },
    });
  }

  // 액션 실행
  private async executeAction(actionId: string) {
    const action = await this.prisma.pendingAction.findUnique({
      where: { id: actionId },
    });
    if (!action || action.status === "EXECUTED") return action;

    try {
      const actionData = (action.data as any) || {};

      switch (action.actionType) {
        case "REVIEW_REPLY":
          // 리뷰 답변 승인 → APPROVED 상태로 변경
          if (actionData.reviewId) {
            await this.reviewService.approveReply(
              action.storeId,
              actionData.reviewId,
              actionData.replyText,
            );
          }
          break;

        case "CONTENT_PUBLISH":
          // 콘텐츠는 이미 생성되어 있고, 여기서는 상태만 변경
          // 실제 네이버 발행은 OAuth 연동 후 구현
          if (actionData.contentId) {
            await this.prisma.generatedContent.update({
              where: { id: actionData.contentId },
              data: { status: "PUBLISHED" },
            });
          }
          break;

        case "KEYWORD_ADD":
        case "SEASONAL_KEYWORD":
          if (actionData.keyword) {
            try {
              await this.prisma.storeKeyword.create({
                data: {
                  storeId: action.storeId,
                  keyword: actionData.keyword,
                  type: action.actionType === "SEASONAL_KEYWORD" ? "SEASONAL" : "AI_RECOMMENDED",
                },
              });
            } catch {} // 중복 무시
          }
          break;
      }

      // 실행 완료
      await this.prisma.pendingAction.update({
        where: { id: actionId },
        data: { status: "EXECUTED", executedAt: new Date() },
      });

      // ActionLog에 기록 (효과 추적용)
      await this.actionTracking.logAction(action.storeId, {
        actionType: action.actionType,
        description: action.title,
        relatedKeywords: actionData.relatedKeywords || [],
      });

      this.logger.log(`액션 실행 완료: [${action.actionType}] ${action.title}`);
      return action;

    } catch (e: any) {
      await this.prisma.pendingAction.update({
        where: { id: actionId },
        data: { status: "FAILED" },
      });
      this.logger.error(`액션 실행 실패: ${e.message}`);
      throw e;
    }
  }

  // 대기 중인 액션 목록
  async getPendingActions(storeId: string) {
    return this.prisma.pendingAction.findMany({
      where: { storeId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }

  // 액션 히스토리
  async getActionHistory(storeId: string) {
    return this.prisma.pendingAction.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  // 자동화 설정 조회/생성
  async getOrCreateSettings(storeId: string) {
    let settings = await this.prisma.storeAutoSettings.findUnique({
      where: { storeId },
    });
    if (!settings) {
      settings = await this.prisma.storeAutoSettings.create({
        data: { storeId },
      });
    }
    return settings;
  }

  // 자동화 설정 업데이트
  async updateSettings(
    storeId: string,
    data: {
      autoReviewReply?: boolean;
      autoContentPublish?: boolean;
      contentPublishPerWeek?: number;
      autoSeasonalKeyword?: boolean;
      autoHiddenKeyword?: boolean;
    },
  ) {
    await this.getOrCreateSettings(storeId);
    return this.prisma.storeAutoSettings.update({
      where: { storeId },
      data,
    });
  }

  private shouldAutoExecute(actionType: string, settings: any): boolean {
    switch (actionType) {
      case "REVIEW_REPLY": return settings.autoReviewReply;
      case "CONTENT_PUBLISH": return settings.autoContentPublish;
      case "SEASONAL_KEYWORD": return settings.autoSeasonalKeyword;
      case "KEYWORD_ADD":
      case "HIDDEN_KEYWORD": return settings.autoHiddenKeyword;
      default: return false;
    }
  }
}
