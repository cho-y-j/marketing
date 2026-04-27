import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchProvider } from "../../providers/naver/naver-search.provider";

/**
 * 외부 블로그 mention — 매장명으로 네이버 블로그 검색했을 때 나오는 다른 사람의 글.
 *
 * 사장님 룰 (캐시노트 벤치마크):
 *  - "어느 채널이 화제냐" 직접 보고 마케팅 의사결정
 *  - 매일 1회 cron 으로 새 글 추적, 30일 백필 영속화
 *  - 단순 카운트가 아니라 **글 제목·작성자·미리보기·원문 링크** 까지 보여주기
 *
 * 데이터 소스: 네이버 블로그 검색 API (sort=date) — 매장명으로 검색 → 최신순 100건.
 * 100건 너머는 못 가져옴 (네이버 검색 API 한계).
 */
@Injectable()
export class BlogMentionService {
  private readonly logger = new Logger(BlogMentionService.name);

  constructor(
    private prisma: PrismaService,
    private naverSearch: NaverSearchProvider,
  ) {}

  /**
   * 매장 1개에 대해 네이버 블로그 검색 후 새 글만 upsert.
   * 매일 cron + 신규 등록 시 백필 둘 다 사용.
   *
   * @returns { fetched, inserted } — 가져온 총 글 수 / 새로 저장한 수
   */
  async collectForStore(storeId: string): Promise<{ fetched: number; inserted: number }> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    if (!store) return { fetched: 0, inserted: 0 };

    const items = await this.naverSearch
      .searchBlog(store.name, 100, "date")
      .catch((e) => {
        this.logger.warn(`[blog-mention] "${store.name}" 검색 실패: ${e.message}`);
        return [];
      });

    let inserted = 0;
    for (const it of items) {
      const url = it.link?.trim();
      if (!url) continue;
      // postdate "20260415" → Date
      const postedAt = this.parseDate(it.postdate);
      if (!postedAt) continue;
      const title = stripHtml(it.title || "").slice(0, 200);
      const blogger = it.bloggername?.trim() || null;
      const snippet = stripHtml(it.description || "").slice(0, 300) || null;

      try {
        await this.prisma.blogMention.upsert({
          where: { storeId_url: { storeId, url } },
          update: {}, // 같은 URL 다시 받으면 indexedAt 만 유지 — title/snippet 갱신은 노이즈
          create: { storeId, postedAt, title, url, blogger, snippet },
        });
        inserted++;
      } catch (e: any) {
        if (!e.message?.includes("Unique")) {
          this.logger.debug(`[blog-mention] upsert 실패 ${url}: ${e.message}`);
        }
      }
    }

    this.logger.log(
      `[blog-mention] ${store.name} — 가져옴 ${items.length} / 신규 ${inserted}`,
    );
    return { fetched: items.length, inserted };
  }

  /**
   * 매장 등록 시 호출 — 30일 백필. collectForStore 와 동일 (네이버 sort=date 100건이
   * 30일 안에 다 들어오는 매장은 자연스럽게 백필됨). 인기 매장이라 100건 < 30일이면
   * 가져올 수 있는 만큼만.
   */
  async backfillForStore(storeId: string): Promise<{ fetched: number; inserted: number }> {
    return this.collectForStore(storeId);
  }

  /**
   * 어제 (UTC) 새로 발행된 글 수 — 푸시 알림용.
   */
  async countYesterday(storeId: string): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return this.prisma.blogMention.count({
      where: {
        storeId,
        postedAt: { gte: yesterday, lt: today },
      },
    });
  }

  /**
   * 최근 글 N건 (UI 리스트용).
   */
  async getRecent(storeId: string, limit = 10) {
    return this.prisma.blogMention.findMany({
      where: { storeId },
      orderBy: { postedAt: "desc" },
      take: limit,
      select: {
        id: true,
        postedAt: true,
        title: true,
        url: true,
        blogger: true,
        snippet: true,
      },
    });
  }

  /**
   * 30일 일별 카운트 (스파크라인용). 빈 날짜는 0 으로 채움.
   */
  async getDailyTrend(storeId: string, days = 30): Promise<Array<{ date: string; count: number }>> {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);

    const rows = await this.prisma.blogMention.findMany({
      where: { storeId, postedAt: { gte: start } },
      select: { postedAt: true },
    });

    const byDay = new Map<string, number>();
    for (const r of rows) {
      const key = r.postedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    const result: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, count: byDay.get(key) ?? 0 });
    }
    return result;
  }

  /**
   * 통합 응답 — UI 한 화면용. 30일 합계, 7일 합계, 추세, 최근 글, 경쟁사 평균 비교.
   */
  async getOverview(storeId: string) {
    const [recent, trend, competitorAvg] = await Promise.all([
      this.getRecent(storeId, 10),
      this.getDailyTrend(storeId, 30),
      this.computeCompetitorAvg(storeId, 30),
    ]);
    const total30d = trend.reduce((s, t) => s + t.count, 0);
    const total7d = trend.slice(-7).reduce((s, t) => s + t.count, 0);
    const yesterday = trend[trend.length - 1]?.count ?? 0;
    return {
      total30d,
      total7d,
      yesterday,
      trend, // 30일 일별 [{ date, count }]
      recent,
      competitorAvg30d: competitorAvg,
    };
  }

  /**
   * 같은 매장의 경쟁사 매장명들로 똑같이 블로그 검색 → 30일 평균.
   * "내 매장 N건 / 경쟁사 평균 M건" 비교용. 경쟁사 BlogMention 도 영속화.
   */
  private async computeCompetitorAvg(storeId: string, days = 30): Promise<number | null> {
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId },
      select: { competitorName: true },
      take: 6,
    });
    if (competitors.length === 0) return null;

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days);

    // 경쟁사는 별도 storeId 가 없으므로 같은 storeId 의 BlogMention 에 저장하지 않음.
    // 단순 평균: 경쟁사 매장명으로 네이버 블로그 검색 → 최근 days 글 수 (현장 호출).
    // 비용 — 경쟁사 6명 × 1 호출 = 매 요청마다 6 호출. 나중에 캐싱으로 옮길 수 있음.
    let total = 0;
    let counted = 0;
    for (const c of competitors) {
      try {
        const items = await this.naverSearch.searchBlog(c.competitorName, 100, "date");
        const cutKey = since.toISOString().slice(0, 10).replace(/-/g, "");
        const within = items.filter((it) => (it.postdate || "") >= cutKey).length;
        total += within;
        counted++;
      } catch {}
    }
    return counted > 0 ? Math.round(total / counted) : null;
  }

  // === helpers ===
  private parseDate(yyyymmdd: string): Date | null {
    if (!yyyymmdd || yyyymmdd.length !== 8) return null;
    const y = yyyymmdd.slice(0, 4);
    const m = yyyymmdd.slice(4, 6);
    const d = yyyymmdd.slice(6, 8);
    const date = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
    return isNaN(date.getTime()) ? null : date;
  }
}

/** HTML 태그 제거 (네이버 검색 API 는 <b> 등 태그가 섞여 옴) */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim();
}
