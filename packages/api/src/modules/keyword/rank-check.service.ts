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

  /**
   * 키워드별 경쟁 매트릭스 (Top 10 매장 + 내 위치 + 추이 + 인사이트)
   * compareDays: N일전 vs 오늘 비교 (1, 5, 7, 14, 30, 60)
   */
  async getKeywordCompetition(storeId: string, keyword: string, compareDays = 1) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { keywords: { where: { keyword } } },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    // 1. 최신 RankHistory 조회 (없으면 지금 체크)
    let latest = await this.prisma.keywordRankHistory.findFirst({
      where: { storeId, keyword },
      orderBy: { checkedAt: "desc" },
    });

    let topPlaces: any[] = (latest?.topPlaces as any[]) || [];

    // 풍부한 데이터(visitorReviewCount 등)가 없으면 즉시 재체크
    const hasRichData = topPlaces.length > 0 && topPlaces.some((p) => p.visitorReviewCount != null);
    if (!hasRichData) {
      const result = await this.rankChecker.checkPlaceRank(
        keyword, store.name, store.naverPlaceId || undefined,
      );
      latest = await this.prisma.keywordRankHistory.create({
        data: {
          storeId, keyword,
          rank: result.rank,
          totalResults: result.totalResults,
          topPlaces: result.topPlaces as any,
        },
      });
      topPlaces = result.topPlaces;
    }

    // 2. 일별 추이 (최근 60일)
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const histories = await this.prisma.keywordRankHistory.findMany({
      where: { storeId, keyword, checkedAt: { gte: since } },
      orderBy: { checkedAt: "asc" },
      select: { rank: true, checkedAt: true, topPlaces: true },
    });
    const trend = histories.map((h) => ({
      date: h.checkedAt.toISOString().split("T")[0],
      rank: h.rank,
    }));

    // 3. N일전 비교 — 정확히 N일 전 기록이 없으면 그 근처(±compareDays) 가장 가까운 것으로 근사
    const compareDate = new Date();
    compareDate.setDate(compareDate.getDate() - compareDays);
    compareDate.setHours(0, 0, 0, 0);
    const compareNextDay = new Date(compareDate.getTime() + 24 * 60 * 60 * 1000);
    let comparePrev = await this.prisma.keywordRankHistory.findFirst({
      where: {
        storeId, keyword,
        checkedAt: { gte: compareDate, lt: compareNextDay },
      },
      orderBy: { checkedAt: "desc" },
    });
    let compareApproximate = false;
    if (!comparePrev) {
      // 1단계: compareDate ±compareDays 윈도우에서 가장 가까운 과거 기록
      const windowStart = new Date(compareDate);
      windowStart.setDate(windowStart.getDate() - Math.max(1, compareDays));
      comparePrev = await this.prisma.keywordRankHistory.findFirst({
        where: {
          storeId, keyword,
          checkedAt: { gte: windowStart, lt: compareNextDay },
        },
        orderBy: { checkedAt: "desc" },
      });
      // 2단계: 그래도 없으면 오늘 이전의 가장 오래된 기록 아무거나 사용
      // (신규 매장이라 과거 데이터가 얼마 안 되는 경우)
      if (!comparePrev) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        comparePrev = await this.prisma.keywordRankHistory.findFirst({
          where: { storeId, keyword, checkedAt: { lt: todayStart } },
          orderBy: { checkedAt: "asc" },
        });
      }
      if (comparePrev) compareApproximate = true;
    }
    const actualCompareDays = comparePrev
      ? Math.max(
          1,
          Math.round((Date.now() - comparePrev.checkedAt.getTime()) / (24 * 60 * 60 * 1000)),
        )
      : null;
    const prevTopPlaces = (comparePrev?.topPlaces as any[]) || [];
    // placeId/이름 키로 N일전 시점 데이터 매핑 (rank + 리뷰수 전체)
    const prevPlaceMap = new Map<
      string,
      { rank: number; visitorReviewCount?: number | null; blogReviewCount?: number | null }
    >();
    for (const p of prevTopPlaces) {
      const entry = {
        rank: p.rank,
        visitorReviewCount: p.visitorReviewCount ?? null,
        blogReviewCount: p.blogReviewCount ?? null,
      };
      if (p.placeId) prevPlaceMap.set(p.placeId, entry);
      prevPlaceMap.set(p.name, entry);
    }

    // 3-b. 내 매장 스냅샷 fallback (비교 날짜에 KeywordRankHistory 없을 때 써짐 드물게)
    const snapDate = new Date();
    snapDate.setUTCHours(0, 0, 0, 0);
    const storeSnap = await this.prisma.storeDailySnapshot.findFirst({
      where: { storeId, date: { lte: snapDate } },
      orderBy: { date: "desc" },
      select: { visitorDelta: true, blogDelta: true, date: true },
    });

    // topPlaces에 변동량 추가 — N일전 topPlaces 의 시점 리뷰수와 비교해 기간 증감 계산
    // placeId 가 있으면 추적 여부 무관하게 모든 경쟁사 증감이 나옴.
    topPlaces = topPlaces.map((p: any) => {
      const prev =
        (p.placeId && prevPlaceMap.get(p.placeId)) || prevPlaceMap.get(p.name) || null;
      const rankChange = prev?.rank != null ? prev.rank - p.rank : null;

      let visitorDelta: number | null = null;
      let blogDelta: number | null = null;
      if (prev && p.visitorReviewCount != null && prev.visitorReviewCount != null) {
        visitorDelta = p.visitorReviewCount - prev.visitorReviewCount;
      }
      if (prev && p.blogReviewCount != null && prev.blogReviewCount != null) {
        blogDelta = p.blogReviewCount - prev.blogReviewCount;
      }
      // 내 매장은 historical 매칭 실패 시 StoreDailySnapshot delta 폴백 (compareDays=1 일 때만 유효)
      if (p.isMine && visitorDelta == null && compareDays === 1) {
        visitorDelta = storeSnap?.visitorDelta ?? null;
      }
      if (p.isMine && blogDelta == null && compareDays === 1) {
        blogDelta = storeSnap?.blogDelta ?? null;
      }

      return {
        ...p,
        prevRank: prev?.rank ?? null,
        rankChange,
        isHot: rankChange != null && rankChange >= 10,
        visitorDelta,
        blogDelta,
      };
    });

    // 3-c. 내 매장 7일/30일 누적 리뷰 증가 (상단 스탯용)
    // 정확히 N일 전 스냅샷이 없으면 가장 오래된 스냅샷을 기준선으로 사용 (부분 집계).
    // 그래도 없으면 현재 누적을 "매장 가입일~오늘" 일수로 나눈 추정 일평균 × 기간으로 fallback.
    const weekAgo = new Date(snapDate);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(snapDate);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const latestSnap = await this.prisma.storeDailySnapshot.findFirst({
      where: { storeId },
      orderBy: { date: "desc" },
      select: { visitorReviewCount: true, blogReviewCount: true, date: true },
    });
    const oldestSnap = await this.prisma.storeDailySnapshot.findFirst({
      where: { storeId },
      orderBy: { date: "asc" },
      select: { visitorReviewCount: true, blogReviewCount: true, date: true },
    });
    const weekSnap =
      (await this.prisma.storeDailySnapshot.findFirst({
        where: { storeId, date: { lte: weekAgo } },
        orderBy: { date: "desc" },
        select: { visitorReviewCount: true, blogReviewCount: true, date: true },
      })) || oldestSnap;
    const monthSnap =
      (await this.prisma.storeDailySnapshot.findFirst({
        where: { storeId, date: { lte: monthAgo } },
        orderBy: { date: "desc" },
        select: { visitorReviewCount: true, blogReviewCount: true, date: true },
      })) || oldestSnap;

    // 스냅샷이 완전히 없을 때 선형 추정용 일평균 — Place 현재 누적 / 매장 등록 후 일수
    const linearDailyEstimate = async (field: "visitorReviewCount" | "blogReviewCount") => {
      const storeRow = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { createdAt: true, naverPlaceId: true },
      });
      if (!storeRow) return null;
      const ageDays = Math.max(
        30,
        Math.round((Date.now() - storeRow.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const snapTotal = latestSnap?.[field];
      if (snapTotal == null) return null;
      return snapTotal / ageDays;
    };

    const diffSpan = (from: { date: Date } | null | undefined, to: { date: Date } | null | undefined) => {
      if (!from || !to) return null;
      return Math.max(
        1,
        Math.round((to.date.getTime() - from.date.getTime()) / (24 * 60 * 60 * 1000)),
      );
    };

    const computeDelta = async (
      from: { visitorReviewCount: number | null; blogReviewCount: number | null; date: Date } | null,
      field: "visitorReviewCount" | "blogReviewCount",
      targetDays: number,
    ): Promise<{ value: number | null; isEstimated: boolean }> => {
      if (latestSnap && from && latestSnap[field] != null && from[field] != null) {
        const span = diffSpan(from, latestSnap) ?? targetDays;
        const raw = (latestSnap[field] ?? 0) - (from[field] ?? 0);
        if (span === targetDays) return { value: raw, isEstimated: false };
        // 부분 집계 → 일평균 비례
        return {
          value: Math.round((raw / span) * targetDays),
          isEstimated: true,
        };
      }
      const rate = await linearDailyEstimate(field);
      if (rate == null) return { value: null, isEstimated: false };
      return { value: Math.round(rate * targetDays), isEstimated: true };
    };

    const [wv, wb, mv, mb] = await Promise.all([
      computeDelta(weekSnap, "visitorReviewCount", 7),
      computeDelta(weekSnap, "blogReviewCount", 7),
      computeDelta(monthSnap, "visitorReviewCount", 30),
      computeDelta(monthSnap, "blogReviewCount", 30),
    ]);

    const myDeltas = {
      daily: {
        visitor: storeSnap?.visitorDelta ?? null,
        blog: storeSnap?.blogDelta ?? null,
      },
      weekly: {
        visitor: wv.value,
        blog: wb.value,
        isEstimated: wv.isEstimated || wb.isEstimated,
      },
      monthly: {
        visitor: mv.value,
        blog: mb.value,
        isEstimated: mv.isEstimated || mb.isEstimated,
      },
    };

    // 3. 내 매장 정보
    const myKeyword = store.keywords[0];
    const myRankInTopPlaces = topPlaces.find((p: any) => p.isMine);

    // 4. 인사이트 자동 생성
    const insights: string[] = [];
    const myRank = myKeyword?.currentRank || myRankInTopPlaces?.rank;
    if (myRank) {
      insights.push(`현재 ${myRank}위에 노출되고 있습니다`);
      const top1 = topPlaces.find((p: any) => p.rank === 1);
      if (top1 && !top1.isMine) {
        if (top1.visitorReviewCount != null && myRankInTopPlaces?.visitorReviewCount != null) {
          const ratio = (myRankInTopPlaces.visitorReviewCount / Math.max(top1.visitorReviewCount, 1)).toFixed(1);
          if (myRankInTopPlaces.visitorReviewCount > top1.visitorReviewCount) {
            insights.push(`방문자 리뷰는 1위(${top1.name}) 대비 ${ratio}배 많음 — 강점`);
          } else {
            insights.push(`방문자 리뷰가 1위(${top1.name})의 ${ratio}배 — 격차 해소 필요`);
          }
        }
        if (top1.blogReviewCount != null && myRankInTopPlaces?.blogReviewCount != null) {
          if (myRankInTopPlaces.blogReviewCount < top1.blogReviewCount * 0.7) {
            insights.push(`블로그 리뷰가 1위(${top1.blogReviewCount}건) 대비 부족 — 콘텐츠 작업 필요`);
          }
        }
      }
    } else {
      insights.push(`아직 ${topPlaces.length}위 안에 노출되지 않음 — 키워드 전략 개선 필요`);
    }

    return {
      keyword,
      checkedAt: latest?.checkedAt,
      myRank,
      monthlyVolume: myKeyword?.monthlySearchVolume,
      totalResults: latest?.totalResults,
      topPlaces,
      myMetrics: myRankInTopPlaces || null,
      myDeltas,
      trend,
      insights,
      compareDays,
      compareDate: comparePrev?.checkedAt || null,
      actualCompareDays,
      compareApproximate,
    };
  }
}
