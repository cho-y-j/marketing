import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { NaverSearchProvider } from "../../providers/naver/naver-search.provider";

/**
 * 경쟁사·내 매장 과거 30일 일별 스냅샷 역산 backfill.
 *
 * 경쟁사 추가 시 스냅샷은 당일부터 찍히는데 (매일 01:00 cron),
 * 과거 데이터가 없으면 차트에 점 1개만 찍혀 비교 불가.
 *
 * 역산 전략:
 *  - 방문자 리뷰: Place API 최근 100건 리뷰의 날짜 파싱 → 일별 증가량 집계
 *  - 블로그 리뷰: 네이버 블로그 검색(sort=date) 최근 100건의 postdate 파싱
 *  - 오늘 누적값에서 과거로 역산해 각 날짜별 누적 snapshot 생성
 *
 * 한계:
 *  - 100건 초과 과거 리뷰는 커버 불가 (인기 매장은 며칠만 역산됨)
 *  - 블로그 검색 결과는 매장명 관련성만 보장, 100% 정확도 아님
 */
@Injectable()
export class CompetitorBackfillService {
  private readonly logger = new Logger(CompetitorBackfillService.name);

  constructor(
    private prisma: PrismaService,
    private place: NaverPlaceProvider,
    private naverSearch: NaverSearchProvider,
  ) {}

  /**
   * 한 경쟁사에 대해 최근 30일 일별 스냅샷 역산·insert.
   * 이미 존재하는 날짜는 건드리지 않음 (upsert but skip-if-exists).
   */
  async backfillCompetitor(
    storeId: string,
    competitorPlaceId: string,
    competitorName: string,
    daysToBackfill = 30,
  ): Promise<{ visitorDays: number; blogDays: number }> {
    this.logger.log(`[백필] ${competitorName} (${competitorPlaceId}) 시작`);

    // 현재 누적값 먼저 확보
    const currentDetail = await this.place.getPlaceDetail(competitorPlaceId);
    if (!currentDetail) {
      this.logger.warn(`[백필] ${competitorName} place 조회 실패 — 스킵`);
      return { visitorDays: 0, blogDays: 0 };
    }
    const totalVisitor = currentDetail.visitorReviewCount ?? 0;
    const totalBlog = currentDetail.blogReviewCount ?? 0;

    // 방문자 리뷰 역산 (최근 100건 = 5페이지)
    const visitorDailyAdd = await this.fetchVisitorDailyAdd(competitorPlaceId, 5);
    // 블로그 리뷰 역산
    const blogDailyAdd = await this.fetchBlogDailyAdd(competitorName);

    const snapshots = this.computeBackwardCumulative(
      { visitor: totalVisitor, blog: totalBlog },
      visitorDailyAdd,
      blogDailyAdd,
      daysToBackfill,
    );

    // DB에 upsert (skip if exists 로직은 prisma upsert 로는 안 되므로 createMany skipDuplicates 활용)
    let visitorDays = 0;
    let blogDays = 0;
    for (const s of snapshots) {
      const existing = await this.prisma.competitorDailySnapshot.findUnique({
        where: {
          storeId_competitorPlaceId_date: {
            storeId,
            competitorPlaceId,
            date: s.date,
          },
        },
        select: { id: true, visitorReviewCount: true, blogReviewCount: true },
      });
      if (existing) continue; // 이미 있으면 건드리지 않음

      await this.prisma.competitorDailySnapshot.create({
        data: {
          storeId,
          competitorPlaceId,
          date: s.date,
          visitorReviewCount: s.visitor,
          blogReviewCount: s.blog,
          visitorDelta: s.visitorDelta,
          blogDelta: s.blogDelta,
        },
      });
      if (s.visitor != null) visitorDays++;
      if (s.blog != null) blogDays++;
    }

    this.logger.log(
      `[백필] ${competitorName} 완료 — 방문자 ${visitorDays}일, 블로그 ${blogDays}일`,
    );
    return { visitorDays, blogDays };
  }

  /** 내 매장 동일 로직 (StoreDailySnapshot) */
  async backfillStore(storeId: string, daysToBackfill = 30) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { naverPlaceId: true, name: true },
    });
    if (!store?.naverPlaceId) return { visitorDays: 0, blogDays: 0 };

    const detail = await this.place.getPlaceDetail(store.naverPlaceId);
    if (!detail) return { visitorDays: 0, blogDays: 0 };

    const visitorDailyAdd = await this.fetchVisitorDailyAdd(store.naverPlaceId, 5);
    const blogDailyAdd = await this.fetchBlogDailyAdd(store.name);

    const snapshots = this.computeBackwardCumulative(
      { visitor: detail.visitorReviewCount ?? 0, blog: detail.blogReviewCount ?? 0 },
      visitorDailyAdd,
      blogDailyAdd,
      daysToBackfill,
    );

    let visitorDays = 0;
    let blogDays = 0;
    for (const s of snapshots) {
      const existing = await this.prisma.storeDailySnapshot.findUnique({
        where: { storeId_date: { storeId, date: s.date } },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.storeDailySnapshot.create({
        data: {
          storeId,
          date: s.date,
          visitorReviewCount: s.visitor,
          blogReviewCount: s.blog,
          visitorDelta: s.visitorDelta,
          blogDelta: s.blogDelta,
        },
      });
      if (s.visitor != null) visitorDays++;
      if (s.blog != null) blogDays++;
    }
    this.logger.log(
      `[백필 내매장] ${store.name} — 방문자 ${visitorDays}일, 블로그 ${blogDays}일`,
    );
    return { visitorDays, blogDays };
  }

  /** 특정 매장의 모든 경쟁사 backfill */
  async backfillAllCompetitors(storeId: string) {
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId, competitorPlaceId: { not: null } },
      select: { competitorPlaceId: true, competitorName: true },
    });
    let totalVisitor = 0;
    let totalBlog = 0;
    for (const c of competitors) {
      try {
        const r = await this.backfillCompetitor(storeId, c.competitorPlaceId!, c.competitorName);
        totalVisitor += r.visitorDays;
        totalBlog += r.blogDays;
      } catch (e: any) {
        this.logger.warn(`[백필] ${c.competitorName} 실패: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 1500)); // rate limit
    }
    return {
      competitors: competitors.length,
      totalVisitorDays: totalVisitor,
      totalBlogDays: totalBlog,
    };
  }

  // === private helpers ===

  /** Place API 최근 N페이지 리뷰 → 날짜별 증가량 Map (YYYY-MM-DD → count) */
  private async fetchVisitorDailyAdd(placeId: string, maxPages = 5): Promise<Map<string, number>> {
    const byDate = new Map<string, number>();
    for (let page = 1; page <= maxPages; page++) {
      try {
        const data = await this.place.getPlaceReviews(placeId, page);
        if (!data.reviews || data.reviews.length === 0) break;
        for (const r of data.reviews) {
          const key = this.normalizeDate(r.date);
          if (!key) continue;
          byDate.set(key, (byDate.get(key) ?? 0) + 1);
        }
        if (data.reviews.length < 20) break; // 마지막 페이지
      } catch (e: any) {
        this.logger.debug(`리뷰 페이지 ${page} 실패: ${e.message}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return byDate;
  }

  /** 네이버 블로그 최근 100건 → 날짜별 증가량 Map */
  private async fetchBlogDailyAdd(query: string): Promise<Map<string, number>> {
    const byDate = new Map<string, number>();
    try {
      const items = await this.naverSearch.searchBlog(query, 100, "date");
      for (const b of items) {
        if (!b.postdate) continue;
        // postdate: "20260415" → "2026-04-15"
        const key = `${b.postdate.slice(0, 4)}-${b.postdate.slice(4, 6)}-${b.postdate.slice(6, 8)}`;
        byDate.set(key, (byDate.get(key) ?? 0) + 1);
      }
    } catch (e: any) {
      this.logger.debug(`블로그 검색 실패 [${query}]: ${e.message}`);
    }
    return byDate;
  }

  /**
   * 오늘 누적값 + 일별 증가량 맵으로 과거 N일 누적값 역산.
   * cum[today] = total
   * cum[today-1] = total - add[today]
   * cum[today-2] = cum[today-1] - add[today-1]
   * ...
   */
  private computeBackwardCumulative(
    today: { visitor: number; blog: number },
    visitorAdd: Map<string, number>,
    blogAdd: Map<string, number>,
    days: number,
  ): Array<{
    date: Date;
    visitor: number;
    blog: number;
    visitorDelta: number | null;
    blogDelta: number | null;
  }> {
    const result: Array<{
      date: Date;
      visitor: number;
      blog: number;
      visitorDelta: number | null;
      blogDelta: number | null;
    }> = [];
    let cumV = today.visitor;
    let cumB = today.blog;
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const vAdd = visitorAdd.get(key) ?? 0;
      const bAdd = blogAdd.get(key) ?? 0;

      result.push({
        date: d,
        visitor: cumV,
        blog: cumB,
        visitorDelta: i === 0 ? null : vAdd, // i=0 (today) delta 는 어제 대비 → 다음 루프에서 계산됨
        blogDelta: i === 0 ? null : bAdd,
      });

      // 과거로 한 칸 이동 — 해당 날의 증가분을 제거
      cumV -= vAdd;
      cumB -= bAdd;
      if (cumV < 0) cumV = 0;
      if (cumB < 0) cumB = 0;
    }

    // delta 재계산: result[i].delta = result[i].total - result[i+1].total
    for (let i = 0; i < result.length - 1; i++) {
      result[i].visitorDelta = result[i].visitor - result[i + 1].visitor;
      result[i].blogDelta = result[i].blog - result[i + 1].blog;
    }
    return result;
  }

  /** 다양한 날짜 포맷 → YYYY-MM-DD */
  private normalizeDate(s: string | undefined): string | null {
    if (!s) return null;
    // ISO: 2026-04-20T12:34:56 or 2026-04-20
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // 불릿: "25.04.20" "26.4.20"
    const dot = s.match(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})/);
    if (dot) {
      const yr = dot[1].length === 2 ? `20${dot[1]}` : dot[1];
      return `${yr}-${dot[2].padStart(2, "0")}-${dot[3].padStart(2, "0")}`;
    }
    // YYYYMMDD
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    return null;
  }
}
