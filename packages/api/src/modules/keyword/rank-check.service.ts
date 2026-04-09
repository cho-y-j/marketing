import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverRankCheckerProvider } from "../../providers/naver/naver-rank-checker.provider";
import { NotificationService } from "../notification/notification.service";

@Injectable()
export class RankCheckService {
  private readonly logger = new Logger(RankCheckService.name);

  constructor(
    private prisma: PrismaService,
    private rankChecker: NaverRankCheckerProvider,
    private notificationService: NotificationService,
  ) {}

  // 매장의 모든 키워드 순위 체크
  async checkAllKeywordRanks(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { keywords: true, user: { select: { id: true } } },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    if (store.keywords.length === 0) {
      return { message: "추적 중인 키워드가 없습니다", results: [] };
    }

    this.logger.log(`순위 체크 시작: ${store.name} (${store.keywords.length}개 키워드)`);

    const results = await this.rankChecker.checkMultipleRanks(
      store.keywords.map((kw) => kw.keyword),
      store.name,
      store.naverPlaceId || undefined,
    );

    // DB 업데이트 + 히스토리 저장 + 순위 변동 알림
    const rankChanges: Array<{ keyword: string; prev: number; curr: number; diff: number }> = [];

    for (const result of results) {
      const kw = store.keywords.find((k) => k.keyword === result.keyword);
      if (kw) {
        // 키워드 순위 업데이트
        await this.prisma.storeKeyword.update({
          where: { id: kw.id },
          data: {
            previousRank: kw.currentRank,
            currentRank: result.rank,
            lastCheckedAt: result.checkedAt,
          },
        });

        // 히스토리 레코드 생성 (일별 누적)
        await this.prisma.keywordRankHistory.create({
          data: {
            storeId,
            keyword: result.keyword,
            rank: result.rank,
            totalResults: result.totalResults,
            topPlaces: result.topPlaces,
          },
        });

        // 순위 변동 감지 (이전 순위가 있고, 3단계 이상 변동 시)
        if (kw.currentRank && result.rank) {
          const diff = kw.currentRank - result.rank; // 양수 = 상승
          if (Math.abs(diff) >= 3) {
            rankChanges.push({
              keyword: result.keyword,
              prev: kw.currentRank,
              curr: result.rank,
              diff,
            });
          }
        }
      }
    }

    // 순위 변동 알림 발송
    if (rankChanges.length > 0) {
      const userId = store.user?.id;

      if (userId) {
        for (const change of rankChanges) {
          await this.notificationService.createRankChangeAlert(
            userId,
            change.keyword,
            change.prev,
            change.curr,
          );
          this.logger.log(
            `순위 변동 알림: "${change.keyword}" ${change.prev}위→${change.curr}위 (${change.diff > 0 ? "+" : ""}${change.diff})`,
          );
        }
      }
    }

    // 순위 역전 감지: 경쟁사가 내 순위 위에 있는 경우
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId },
      select: { competitorName: true },
    });
    const competitorNames = new Set(competitors.map((c) => c.competitorName));

    for (const result of results) {
      if (!result.rank || !result.topPlaces) continue;
      // 내 순위보다 위에 있는 경쟁사 찾기
      const overtakers = result.topPlaces
        .filter((p) => p.rank < result.rank! && competitorNames.has(p.name))
        .map((p) => p.name);

      if (overtakers.length > 0 && store.user?.id) {
        for (const overtaker of overtakers) {
          // CompetitorAlert에 순위 역전 기록
          await this.prisma.competitorAlert.create({
            data: {
              storeId,
              competitorName: overtaker,
              alertType: "RANK_OVERTAKE",
              detail: `"${result.keyword}" 검색에서 "${overtaker}"에게 순위를 뺏겼습니다 (내 ${result.rank}위)`,
            },
          });
        }
      }
    }

    this.logger.log(`순위 체크 완료: ${store.name} (변동 알림 ${rankChanges.length}건)`);

    return {
      storeName: store.name,
      checkedAt: new Date(),
      results: results.map((r) => {
        const kw = store.keywords.find((k) => k.keyword === r.keyword);
        const prevRank = kw?.currentRank;
        const diff = prevRank && r.rank ? prevRank - r.rank : null;
        return {
          keyword: r.keyword,
          currentRank: r.rank,
          previousRank: prevRank || null,
          change: diff,
          totalResults: r.totalResults,
          topPlaces: r.topPlaces?.slice(0, 5),
        };
      }),
    };
  }

  // 순위 히스토리 조회
  async getRankHistory(storeId: string, days = 7, keyword?: string) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = { storeId, checkedAt: { gte: since } };
    if (keyword) where.keyword = keyword;

    const records = await this.prisma.keywordRankHistory.findMany({
      where,
      orderBy: { checkedAt: "asc" },
    });

    // 날짜별로 그룹핑 (차트용)
    const grouped: Record<string, Record<string, number | null>> = {};
    for (const r of records) {
      const date = r.checkedAt.toISOString().split("T")[0];
      if (!grouped[date]) grouped[date] = {};
      grouped[date][r.keyword] = r.rank;
    }

    return Object.entries(grouped).map(([date, kws]) => ({
      date,
      ...kws,
    }));
  }

  // 순위 히스토리 요약 (대시보드용)
  async getRankHistorySummary(storeId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const records = await this.prisma.keywordRankHistory.findMany({
      where: { storeId, checkedAt: { gte: since } },
      orderBy: { checkedAt: "desc" },
    });

    // 키워드별 최신/최고/최저 순위
    const byKeyword: Record<string, { latest: number | null; best: number | null; worst: number | null; count: number }> = {};
    for (const r of records) {
      if (!byKeyword[r.keyword]) {
        byKeyword[r.keyword] = { latest: r.rank, best: r.rank, worst: r.rank, count: 0 };
      }
      const kw = byKeyword[r.keyword];
      kw.count++;
      if (r.rank && (!kw.best || r.rank < kw.best)) kw.best = r.rank;
      if (r.rank && (!kw.worst || r.rank > kw.worst)) kw.worst = r.rank;
    }

    return byKeyword;
  }

  // 단일 키워드 순위 체크
  async checkSingleKeyword(storeId: string, keyword: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    const result = await this.rankChecker.checkPlaceRank(
      keyword,
      store.name,
      store.naverPlaceId || undefined,
    );

    // 히스토리 저장
    await this.prisma.keywordRankHistory.create({
      data: {
        storeId,
        keyword,
        rank: result.rank,
        totalResults: result.totalResults,
        topPlaces: result.topPlaces,
      },
    });

    return {
      storeName: store.name,
      keyword,
      rank: result.rank,
      totalResults: result.totalResults,
      topPlaces: result.topPlaces?.slice(0, 10),
      checkedAt: result.checkedAt,
    };
  }
}
