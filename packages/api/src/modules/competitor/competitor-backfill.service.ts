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
          isEstimated: s.isEstimated,
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
          isEstimated: s.isEstimated,
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
   *
   * 증거(실 관측 날짜)가 충분하면 실데이터로 역산.
   * 증거가 부족하면 선형 추정 fallback:
   *  - 실 관측된 일평균 속도 > 0 이면 그 속도로 과거 분포
   *  - 관측 속도 없으면 총 누적에서 가상 속도(누적/365일) 선형 분배
   *  - 분포는 최근일 쪽 가중치 ↑ (실제 매장 성장 패턴 근사)
   *
   * 추정치인 날은 isEstimated=true 로 표시.
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
    isEstimated: boolean;
  }> {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    // 1단계: 각 날짜별 증거(실 관측) 증가량 수집
    const observedV: Array<number | null> = [];
    const observedB: Array<number | null> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      observedV.push(visitorAdd.has(key) ? visitorAdd.get(key)! : null);
      observedB.push(blogAdd.has(key) ? blogAdd.get(key)! : null);
    }

    // 2단계: 관측 일평균 속도 계산 (증거 부족 시 가상 속도)
    const estV = this.estimateDailyRate(observedV, today.visitor, days);
    const estB = this.estimateDailyRate(observedB, today.blog, days);

    // 3단계: 각 날짜 확정 — 관측 있으면 관측값, 없으면 추정값
    const addsV: number[] = [];
    const addsB: number[] = [];
    const estimatedFlags: boolean[] = [];
    for (let i = 0; i < days; i++) {
      const vObs = observedV[i];
      const bObs = observedB[i];
      // 가중치: 최근일 쪽이 약간 더 높게 (1.0 → 0.7 선형 감쇠)
      const weight = 1.0 - (0.3 * i) / Math.max(1, days - 1);
      const vEstDay = estV * weight;
      const bEstDay = estB * weight;
      addsV.push(vObs ?? vEstDay);
      addsB.push(bObs ?? bEstDay);
      // 방문자/블로그 중 하나라도 추정이면 그날은 추정으로 간주
      estimatedFlags.push(vObs == null || bObs == null);
    }

    // 4단계: 오늘 누적값에서 과거로 역산
    const result: Array<{
      date: Date;
      visitor: number;
      blog: number;
      visitorDelta: number | null;
      blogDelta: number | null;
      isEstimated: boolean;
    }> = [];
    let cumV = today.visitor;
    let cumB = today.blog;

    for (let i = 0; i < days; i++) {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() - i);
      result.push({
        date: d,
        visitor: Math.max(0, Math.round(cumV)),
        blog: Math.max(0, Math.round(cumB)),
        visitorDelta: null, // 아래서 재계산
        blogDelta: null,
        isEstimated: estimatedFlags[i],
      });
      // 과거로 한 칸 이동 (해당 날 증가분 제거)
      cumV -= addsV[i];
      cumB -= addsB[i];
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

  /**
   * 일평균 증가 속도 추정.
   * - 관측 5일 이상 있으면 관측 평균
   * - 관측 부족 시 "총 누적 / 가정 운영일수(365)" 로 약한 베이스라인
   * - 너무 큰 속도는 최근 30일 기준 누적의 10% 로 클램프 (단일 매장이 30일간 누적의 10% 이상 증가 가정 방지)
   */
  private estimateDailyRate(
    observed: Array<number | null>,
    totalCumulative: number,
    days: number,
  ): number {
    const real = observed.filter((v): v is number => v != null);
    if (real.length >= 5) {
      const avg = real.reduce((a, b) => a + b, 0) / real.length;
      return Math.max(0, avg);
    }
    // 베이스라인 — 매우 보수적 (365일 운영 가정)
    if (totalCumulative <= 0) return 0;
    const baseline = totalCumulative / 365;
    // 최근 30일간 누적의 10% 이내로 클램프
    const clampMax = (totalCumulative * 0.1) / days;
    return Math.min(baseline, clampMax);
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
