import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

/**
 * 마케팅 액션 추적 + 효과 측정 서비스.
 *
 * 흐름:
 *  1. 사장님이 액션 실행 (콘텐츠 발행, 키워드 추가, 리뷰 답변 등)
 *  2. ActionLog에 기록 + 실행 시점 순위 스냅샷
 *  3. 7일 후 배치잡이 효과 측정 (순위 변동, 노출 변화)
 *  4. effectSummary 자동 채움 → 프론트에서 표시
 */
@Injectable()
export class ActionTrackingService {
  private readonly logger = new Logger(ActionTrackingService.name);

  constructor(private prisma: PrismaService) {}

  // 액션 기록
  async logAction(
    storeId: string,
    data: {
      actionType: string;
      description: string;
      relatedKeywords?: string[];
    },
  ) {
    // 실행 시점 순위 스냅샷
    const rankBefore: Record<string, number | null> = {};
    if (data.relatedKeywords?.length) {
      const keywords = await this.prisma.storeKeyword.findMany({
        where: { storeId, keyword: { in: data.relatedKeywords } },
        select: { keyword: true, currentRank: true },
      });
      for (const kw of keywords) {
        rankBefore[kw.keyword] = kw.currentRank;
      }
    }

    return this.prisma.actionLog.create({
      data: {
        storeId,
        actionType: data.actionType,
        description: data.description,
        relatedKeywords: data.relatedKeywords || [],
        rankBefore,
      },
    });
  }

  // 효과 측정 (7일 후 호출)
  async measureEffect(actionId: string) {
    const action = await this.prisma.actionLog.findUnique({
      where: { id: actionId },
    });
    if (!action || action.effectMeasuredAt) return null;

    const rankBefore = (action.rankBefore as Record<string, number | null>) || {};
    const rankAfter: Record<string, number | null> = {};
    const changes: string[] = [];

    // 현재 순위 조회
    if (action.relatedKeywords.length > 0) {
      const keywords = await this.prisma.storeKeyword.findMany({
        where: {
          storeId: action.storeId,
          keyword: { in: action.relatedKeywords },
        },
        select: { keyword: true, currentRank: true },
      });

      for (const kw of keywords) {
        rankAfter[kw.keyword] = kw.currentRank;
        const before = rankBefore[kw.keyword];
        const after = kw.currentRank;
        if (before && after) {
          const diff = before - after;
          if (diff > 0) changes.push(`"${kw.keyword}" +${diff}위 상승`);
          else if (diff < 0) changes.push(`"${kw.keyword}" ${diff}위 하락`);
          else changes.push(`"${kw.keyword}" 순위 유지`);
        }
      }
    }

    const summary = changes.length > 0
      ? changes.join(", ")
      : "순위 데이터 부족으로 측정 불가";

    return this.prisma.actionLog.update({
      where: { id: actionId },
      data: {
        rankAfter,
        effectMeasuredAt: new Date(),
        effectSummary: summary,
      },
    });
  }

  // 미측정 액션 일괄 효과 측정 (7일 이상 지난 것)
  async measurePendingEffects(storeId?: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const where: any = {
      effectMeasuredAt: null,
      executedAt: { lte: sevenDaysAgo },
    };
    if (storeId) where.storeId = storeId;

    const pending = await this.prisma.actionLog.findMany({ where, take: 50 });
    let measured = 0;

    for (const action of pending) {
      try {
        await this.measureEffect(action.id);
        measured++;
      } catch {}
    }

    return { measured, total: pending.length };
  }

  // 매장의 액션 히스토리
  async getActionHistory(storeId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.actionLog.findMany({
      where: { storeId, executedAt: { gte: since } },
      orderBy: { executedAt: "desc" },
      take: 50,
    });
  }

  // 주간 액션 성과 요약
  async getWeeklySummary(storeId: string) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const actions = await this.prisma.actionLog.findMany({
      where: { storeId, executedAt: { gte: weekAgo } },
      orderBy: { executedAt: "desc" },
    });

    const measured = actions.filter((a) => a.effectMeasuredAt);
    const withImprovement = measured.filter((a) => {
      const summary = a.effectSummary || "";
      return summary.includes("상승");
    });

    return {
      totalActions: actions.length,
      measuredActions: measured.length,
      improvedActions: withImprovement.length,
      actions: actions.map((a) => ({
        type: a.actionType,
        description: a.description,
        executedAt: a.executedAt,
        effectSummary: a.effectSummary,
      })),
    };
  }

  // ROI 계산
  async calculateROI(storeId: string, monthlyFee = 70000) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { avgOrderValue: true, keywords: { select: { keyword: true, monthlySearchVolume: true, currentRank: true, previousRank: true } } },
    });
    if (!store) return null;

    const avgOrder = store.avgOrderValue || 20000;

    // 순위 상승으로 인한 추가 노출 추정
    let additionalExposure = 0;
    for (const kw of store.keywords) {
      if (kw.currentRank && kw.previousRank && kw.currentRank < kw.previousRank) {
        const volume = kw.monthlySearchVolume || 0;
        // CTR 추정: 1위=30%, 3위=15%, 5위=8%, 10위=3%
        const ctrBefore = this.estimateCTR(kw.previousRank);
        const ctrAfter = this.estimateCTR(kw.currentRank);
        additionalExposure += Math.round(volume * (ctrAfter - ctrBefore));
      }
    }

    // 추가 방문 고객 추정 (노출의 2% 전환)
    const additionalVisitors = Math.round(additionalExposure * 0.02);
    const additionalRevenue = additionalVisitors * avgOrder;
    const roi = monthlyFee > 0 ? Math.round((additionalRevenue / monthlyFee) * 100) / 100 : 0;

    return {
      avgOrderValue: avgOrder,
      additionalExposure,
      additionalVisitors,
      additionalRevenue,
      monthlyFee,
      roi,
      roiText: roi > 1
        ? `구독료 대비 ${roi}배 수익`
        : "아직 데이터 수집 중",
    };
  }

  private estimateCTR(rank: number): number {
    if (rank <= 1) return 0.30;
    if (rank <= 3) return 0.15;
    if (rank <= 5) return 0.08;
    if (rank <= 10) return 0.03;
    if (rank <= 20) return 0.01;
    return 0.002;
  }
}
