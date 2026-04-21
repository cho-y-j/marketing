import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchProvider } from "../../providers/naver/naver-search.provider";

/**
 * Phase 8 — 일별 스냅샷 조회 헬퍼.
 * 매장/경쟁사/키워드의 "현재 수치 + 전일 대비 delta + 7일 평균"을 반환.
 *
 * 정적 누적 → 동적 흐름 전환의 핵심 서비스.
 */
@Injectable()
export class DailySnapshotService {
  constructor(
    private prisma: PrismaService,
    private naverSearch: NaverSearchProvider,
  ) {}

  // 매장의 최근 스냅샷 + 7일 평균 일증가량 + 일/주/월 변동량
  async getStoreFlow(storeId: string) {
    const recent = await this.prisma.storeDailySnapshot.findMany({
      where: { storeId },
      orderBy: { date: "desc" },
      take: 30,
    });

    const last = recent[0];
    const yesterday = recent[1];

    const last7 = recent.slice(0, 7);

    const visitorAvg7 = avg(last7.map((r) => r.visitorDelta).filter((x): x is number => x != null));
    const blogAvg7 = avg(last7.map((r) => r.blogDelta).filter((x): x is number => x != null));

    return {
      visitor: {
        current: last?.visitorReviewCount ?? null,
        yesterday: yesterday?.visitorReviewCount ?? null,
        deltaToday: last?.visitorDelta ?? null,
        last7DaysAvg: round1(visitorAvg7),
        // 기간별 총 변동량 — 절대값 차이(today vs N일 전)
        deltaDay: diffCount(recent, "visitorReviewCount", 1),
        deltaWeek: diffCount(recent, "visitorReviewCount", 7),
        deltaMonth: diffCount(recent, "visitorReviewCount", 30),
      },
      blog: {
        current: last?.blogReviewCount ?? null,
        yesterday: yesterday?.blogReviewCount ?? null,
        deltaToday: last?.blogDelta ?? null,
        last7DaysAvg: round1(blogAvg7),
        deltaDay: diffCount(recent, "blogReviewCount", 1),
        deltaWeek: diffCount(recent, "blogReviewCount", 7),
        deltaMonth: diffCount(recent, "blogReviewCount", 30),
      },
      // 30일 시계열 (스파크라인용) — 오래된 순
      timeline: [...recent].reverse().map((r) => ({
        date: r.date,
        visitorDelta: r.visitorDelta,
        blogDelta: r.blogDelta,
        visitor: r.visitorReviewCount,
        blog: r.blogReviewCount,
        isEstimated: r.isEstimated,
      })),
    };
  }

  // 키워드 검색량 — 어제/오늘 + 변화량 + 7일 추이
  async getKeywordFlow(keyword: string) {
    const recent = await this.prisma.keywordDailyVolume.findMany({
      where: { keyword },
      orderBy: { date: "desc" },
      take: 10,
    });
    const last = recent[0];
    const yesterday = recent[1];
    const delta =
      last && yesterday && last.totalVolume != null && yesterday.totalVolume != null
        ? last.totalVolume - yesterday.totalVolume
        : null;
    return {
      keyword,
      today: last?.totalVolume ?? null,
      yesterday: yesterday?.totalVolume ?? null,
      delta,
      timeline: [...recent].reverse().map((r) => ({
        date: r.date,
        total: r.totalVolume,
      })),
    };
  }

  // 경쟁사 일별 타임라인 — 특정 날짜 선택용 (/competitors 날짜 모드)
  async getCompetitorTimeline(storeId: string, topN = 10) {
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId, competitorPlaceId: { not: null } },
      select: { competitorName: true, competitorPlaceId: true },
      take: topN,
    });

    const results = await Promise.all(
      competitors.map(async (c) => {
        const days = await this.prisma.competitorDailySnapshot.findMany({
          where: { storeId, competitorPlaceId: c.competitorPlaceId! },
          orderBy: { date: "desc" },
          take: 30,
        });
        return {
          name: c.competitorName,
          placeId: c.competitorPlaceId,
          days: days.map((d) => ({
            date: d.date.toISOString().slice(0, 10),
            visitor: d.visitorReviewCount,
            blog: d.blogReviewCount,
            visitorDelta: d.visitorDelta,
            blogDelta: d.blogDelta,
            isEstimated: d.isEstimated,
          })),
        };
      }),
    );
    return { competitors: results };
  }

  // 매장 추적 키워드 전체의 오늘/어제 검색량 맵 (대시보드용)
  async getKeywordsFlowForStore(storeId: string) {
    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
      select: { keyword: true },
    });
    const kwList = keywords.map((k) => k.keyword);
    if (kwList.length === 0) return {};

    const rows = await this.prisma.keywordDailyVolume.findMany({
      where: { keyword: { in: kwList } },
      orderBy: { date: "desc" },
    });

    const byKw = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byKw.get(r.keyword) ?? [];
      arr.push(r);
      byKw.set(r.keyword, arr);
    }

    const result: Record<string, { today: number | null; yesterday: number | null; delta: number | null }> = {};
    for (const [kw, list] of byKw) {
      const today = list[0]?.totalVolume ?? null;
      const yesterday = list[1]?.totalVolume ?? null;
      const delta = today != null && yesterday != null ? today - yesterday : null;
      result[kw] = { today, yesterday, delta };
    }
    return result;
  }

  // 상위 N개 경쟁사 일평균 발행량 (매장 분석 화면 핵심)
  async getCompetitorDailyAverages(storeId: string, topN = 10) {
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId, competitorPlaceId: { not: null } },
      select: {
        id: true,
        competitorName: true,
        competitorPlaceId: true,
      },
      take: topN,
    });

    const results = await Promise.all(
      competitors.map(async (c) => {
        // 최근 30일 (월별 변동량까지 커버)
        const recent = await this.prisma.competitorDailySnapshot.findMany({
          where: { storeId, competitorPlaceId: c.competitorPlaceId! },
          orderBy: { date: "desc" },
          take: 30,
        });
        const last7 = recent.slice(0, 7);
        const visitorAvg = avg(last7.map((r) => r.visitorDelta).filter((x): x is number => x != null));
        const blogAvg = avg(last7.map((r) => r.blogDelta).filter((x): x is number => x != null));

        // 기간별 총 변동량 — 절대값 차이(today vs N일 전) 우선, 없으면 delta 합
        const latest = recent[0];
        const visitorDay = diffCount(recent, "visitorReviewCount", 1);
        const blogDay = diffCount(recent, "blogReviewCount", 1);
        let visitorWeek = diffCount(recent, "visitorReviewCount", 7);
        let blogWeek = diffCount(recent, "blogReviewCount", 7);
        let visitorMonth = diffCount(recent, "visitorReviewCount", 30);
        let blogMonth = diffCount(recent, "blogReviewCount", 30);

        // 스냅샷이 부족해 blogWeek/blogMonth 가 null 이면 — 네이버 블로그 검색으로 역산
        // (visitor 리뷰는 공개 API가 없어 역산 불가, 블로그만 보강)
        let blogWeekFromSearch: number | null = null;
        let blogMonthFromSearch: number | null = null;
        if (blogWeek == null || blogMonth == null) {
          try {
            if (blogWeek == null) {
              const w = await this.naverSearch.countRecentBlogPosts(c.competitorName, 7);
              blogWeekFromSearch = w.count;
              blogWeek = blogWeekFromSearch;
            }
            if (blogMonth == null) {
              const m = await this.naverSearch.countRecentBlogPosts(c.competitorName, 30);
              blogMonthFromSearch = m.count;
              blogMonth = blogMonthFromSearch;
            }
          } catch {
            // 네이버 API 실패해도 UI 렌더링에 지장 없도록 무시
          }
        }

        return {
          name: c.competitorName,
          placeId: c.competitorPlaceId,
          visitorAvg7: round1(visitorAvg),
          blogAvg7: round1(blogAvg),
          visitorTotal: latest?.visitorReviewCount ?? null,
          blogTotal: latest?.blogReviewCount ?? null,
          // 기간별 변동량
          deltas: {
            visitor: { day: visitorDay, week: visitorWeek, month: visitorMonth },
            blog: { day: blogDay, week: blogWeek, month: blogMonth },
          },
          // 역산 출처 표시 (UI 배지용)
          blogDeltaSource: {
            week: blogWeekFromSearch != null ? "blogSearch" : "snapshot",
            month: blogMonthFromSearch != null ? "blogSearch" : "snapshot",
          },
        };
      }),
    );

    // 일평균 발행량(방문자+블로그) 기준 정렬
    const sorted = results.sort(
      (a, b) =>
        ((b.visitorAvg7 ?? 0) + (b.blogAvg7 ?? 0)) -
        ((a.visitorAvg7 ?? 0) + (a.blogAvg7 ?? 0)),
    );

    const visitorAvgs = sorted.map((r) => r.visitorAvg7).filter((x): x is number => x != null);
    const blogAvgs = sorted.map((r) => r.blogAvg7).filter((x): x is number => x != null);

    return {
      competitors: sorted,
      summary: {
        topVisitorAvg: round1(avg(visitorAvgs)),
        topBlogAvg: round1(avg(blogAvgs)),
        count: sorted.length,
      },
    };
  }
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function sum(arr: (number | null)[]): number | null {
  const vals = arr.filter((x): x is number => x != null);
  if (vals.length === 0) return null;
  return vals.reduce((s, n) => s + n, 0);
}

/**
 * 기간별 변동량 — today 절대값 - (N일 전 절대값)
 * 정확히 N일 전이 없으면 가장 오래된 값을 기준으로 사용 (실제 간격을 partialDays에 표기 가능)
 */
function diffCount(
  rows: Array<{ date: Date; visitorReviewCount: number | null; blogReviewCount: number | null }>,
  field: "visitorReviewCount" | "blogReviewCount",
  days: number,
): number | null {
  if (rows.length === 0) return null;
  const today = rows[0][field];
  if (today == null) return null;
  // 정확히 N일 전 row 찾기, 없으면 ≥N일 떨어진 가장 가까운 row, 없으면 가장 오래된 row
  const todayDate = rows[0].date.getTime();
  let baseline: number | null = null;
  for (const r of rows) {
    const gap = Math.round((todayDate - r.date.getTime()) / (24 * 60 * 60 * 1000));
    if (gap >= days && r[field] != null) {
      baseline = r[field];
      break;
    }
  }
  // 데이터가 N일보다 짧으면 가장 오래된 값 사용 (부분 집계)
  if (baseline == null) {
    for (let i = rows.length - 1; i > 0; i--) {
      if (rows[i][field] != null) {
        baseline = rows[i][field];
        break;
      }
    }
  }
  if (baseline == null) return null;
  return today - baseline;
}

function round1(v: number | null): number | null {
  if (v == null) return null;
  return Math.round(v * 10) / 10;
}
