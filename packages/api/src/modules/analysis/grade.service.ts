import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

/**
 * 마케팅 등급 시스템.
 * 기준: 액션 수행률 + 순위 변동 + 리뷰 관리율
 *
 * BRONZE:  기본 (가입)
 * SILVER:  액션 수행률 50%+, 순위 체크 활성
 * GOLD:    액션 수행률 70%+, 순위 상승, 리뷰 답변 활성
 * DIAMOND: 액션 수행률 90%+, 상위 10% 매장
 */
@Injectable()
export class GradeService {
  private readonly logger = new Logger(GradeService.name);

  constructor(private prisma: PrismaService) {}

  // 매장 등급 재계산
  async recalculateGrade(storeId: string) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // 1. 액션 수행률 (브리핑 추천 대비 실행 비율)
    const briefings = await this.prisma.dailyBriefing.count({
      where: { storeId, date: { gte: weekAgo } },
    });
    const actions = await this.prisma.actionLog.count({
      where: { storeId, executedAt: { gte: weekAgo } },
    });
    const actionRate = briefings > 0 ? Math.min(100, (actions / (briefings * 3)) * 100) : 0;

    // 2. 순위 상승 키워드 수
    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
      select: { currentRank: true, previousRank: true },
    });
    const improved = keywords.filter((k) => k.currentRank && k.previousRank && k.currentRank < k.previousRank).length;

    // 3. 리뷰 답변율
    const totalReviews = await this.prisma.storeReview.count({
      where: { storeId },
    });
    const repliedReviews = await this.prisma.storeReview.count({
      where: { storeId, replyStatus: { in: ["APPROVED", "PUBLISHED"] } },
    });
    const replyRate = totalReviews > 0 ? (repliedReviews / totalReviews) * 100 : 0;

    // 등급 결정
    let grade = "BRONZE";
    if (actionRate >= 90 && improved >= 3 && replyRate >= 80) grade = "DIAMOND";
    else if (actionRate >= 70 && improved >= 1 && replyRate >= 50) grade = "GOLD";
    else if (actionRate >= 50 || improved >= 1) grade = "SILVER";

    await this.prisma.store.update({
      where: { id: storeId },
      data: { marketingGrade: grade, actionRate: Math.round(actionRate) },
    });

    return { grade, actionRate: Math.round(actionRate), improved, replyRate: Math.round(replyRate) };
  }

  // 동네 벤치마크 (같은 업종/동네 내 순위)
  async getBenchmark(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { district: true, category: true, competitiveScore: true, marketingGrade: true },
    });
    if (!store) return null;

    // 같은 지역+카테고리 매장들
    const peers = await this.prisma.store.findMany({
      where: {
        district: store.district,
        category: store.category,
        competitiveScore: { not: null },
      },
      select: { competitiveScore: true, marketingGrade: true },
      orderBy: { competitiveScore: "desc" },
    });

    const myRank = peers.findIndex((p) => p.competitiveScore === store.competitiveScore) + 1;
    const avgScore = peers.length > 0
      ? Math.round(peers.reduce((s, p) => s + (p.competitiveScore || 0), 0) / peers.length)
      : 0;

    return {
      grade: store.marketingGrade,
      score: store.competitiveScore,
      rankInArea: myRank,
      totalInArea: peers.length,
      avgScore,
      percentile: peers.length > 0 ? Math.round((1 - (myRank - 1) / peers.length) * 100) : 0,
    };
  }
}
