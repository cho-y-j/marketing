import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.service";
import { findAutoAnalysisStores } from "../common/helpers/auto-analysis-targets.helper";
import { NaverPlaceProvider } from "../providers/naver/naver-place.provider";
import { NaverSearchadProvider } from "../providers/naver/naver-searchad.provider";
import { BlogMentionService } from "../modules/blog-mention/blog-mention.service";
import { NotificationService } from "../modules/notification/notification.service";

/**
 * Phase 8 — 일별 스냅샷 수집 배치잡.
 * 매일 01:00 (분석/순위체크 이전) 실행.
 *
 * 수집 대상:
 *  1. StoreDailySnapshot — 매장 리뷰 누적 + 전일 대비 증가량
 *  2. CompetitorDailySnapshot — 추적 경쟁사별 동일
 *  3. KeywordDailyVolume — 추적 키워드별 일별 검색량
 *
 * 목적: 누적이 아닌 "속도(일평균 발행량/검색량)"로 경쟁 비교 가능하게.
 */
@Injectable()
export class DailySnapshotJob {
  private readonly logger = new Logger(DailySnapshotJob.name);

  constructor(
    private prisma: PrismaService,
    private place: NaverPlaceProvider,
    private searchad: NaverSearchadProvider,
    private blogMention: BlogMentionService,
    private notification: NotificationService,
  ) {}

  @Cron("0 1 * * *") // 매일 01:00
  async runDaily() {
    const today = this.todayDate();
    this.logger.log(`[일별 스냅샷] 시작 — ${today.toISOString().slice(0, 10)}`);

    await this.collectStoreSnapshots(today);
    await this.collectCompetitorSnapshots(today);
    await this.collectKeywordVolumes(today);
    await this.collectBlogMentions();

    this.logger.log(`[일별 스냅샷] 완료`);
  }

  /**
   * 외부 블로그 mention 일별 수집 — 매장명으로 네이버 블로그 검색.
   * 어제 새 글 1건 이상이면 푸시 알림 ("내 매장 블로그에 입소문 났어요!").
   */
  async collectBlogMentions() {
    const stores = await findAutoAnalysisStores(this.prisma, {
      select: { id: true, name: true, userId: true },
      caller: "DailySnapshotJob.blogMentions",
    });

    for (const store of stores) {
      try {
        const before = await this.blogMention.countYesterday(store.id);
        await this.blogMention.collectForStore(store.id);
        const after = await this.blogMention.countYesterday(store.id);
        const newCount = Math.max(0, after - before);
        if (newCount > 0 && store.userId) {
          await this.notification
            .notifyNewBlogMentions(store.userId, store.name, newCount)
            .catch((e) => this.logger.warn(`[blog-mention 푸시] ${store.name}: ${e.message}`));
        }
      } catch (e: any) {
        this.logger.warn(`[blog-mention] ${store.name} 실패: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // 매장 스냅샷 — 현재 리뷰 누적을 저장 + 전일 대비 delta 계산
  async collectStoreSnapshots(date: Date) {
    const stores = await findAutoAnalysisStores(this.prisma, {
      select: { id: true, name: true, naverPlaceId: true },
      caller: "DailySnapshotJob",
    });

    for (const store of stores) {
      try {
        const detail = await this.place.getPlaceDetail(store.naverPlaceId!);
        if (!detail) continue;

        const visitor = detail.visitorReviewCount ?? null;
        const blog = detail.blogReviewCount ?? null;

        // 전일 스냅샷으로 delta 계산
        const yesterday = await this.prisma.storeDailySnapshot.findFirst({
          where: { storeId: store.id, date: { lt: date } },
          orderBy: { date: "desc" },
          select: { visitorReviewCount: true, blogReviewCount: true },
        });

        const visitorDelta =
          visitor != null && yesterday?.visitorReviewCount != null
            ? visitor - yesterday.visitorReviewCount
            : null;
        const blogDelta =
          blog != null && yesterday?.blogReviewCount != null
            ? blog - yesterday.blogReviewCount
            : null;

        await this.prisma.storeDailySnapshot.upsert({
          where: { storeId_date: { storeId: store.id, date } },
          update: {
            visitorReviewCount: visitor,
            blogReviewCount: blog,
            visitorDelta,
            blogDelta,
            // 사장님 설계: 매일 cron 이 백필 추정값을 진짜 측정으로 덮어씀 — 플래그도 false 로
            isEstimated: false,
          },
          create: {
            storeId: store.id,
            date,
            visitorReviewCount: visitor,
            blogReviewCount: blog,
            visitorDelta,
            blogDelta,
            isEstimated: false,
          },
        });

        this.logger.log(
          `[${store.name}] 방문자 ${visitor}(+${visitorDelta ?? "?"}) / 블로그 ${blog}(+${blogDelta ?? "?"})`,
        );
      } catch (e: any) {
        this.logger.warn(`[${store.name}] 스냅샷 실패: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // 경쟁사 스냅샷 — 각 storeId의 추적 경쟁사별
  async collectCompetitorSnapshots(date: Date) {
    const competitors = await this.prisma.competitor.findMany({
      where: { competitorPlaceId: { not: null } },
      select: {
        storeId: true,
        competitorPlaceId: true,
        competitorName: true,
      },
    });

    for (const c of competitors) {
      try {
        const detail = await this.place.getPlaceDetail(c.competitorPlaceId!);
        if (!detail) continue;

        const visitor = detail.visitorReviewCount ?? null;
        const blog = detail.blogReviewCount ?? null;

        const yesterday = await this.prisma.competitorDailySnapshot.findFirst({
          where: {
            storeId: c.storeId,
            competitorPlaceId: c.competitorPlaceId!,
            date: { lt: date },
          },
          orderBy: { date: "desc" },
          select: { visitorReviewCount: true, blogReviewCount: true },
        });

        const visitorDelta =
          visitor != null && yesterday?.visitorReviewCount != null
            ? visitor - yesterday.visitorReviewCount
            : null;
        const blogDelta =
          blog != null && yesterday?.blogReviewCount != null
            ? blog - yesterday.blogReviewCount
            : null;

        await this.prisma.competitorDailySnapshot.upsert({
          where: {
            storeId_competitorPlaceId_date: {
              storeId: c.storeId,
              competitorPlaceId: c.competitorPlaceId!,
              date,
            },
          },
          update: {
            visitorReviewCount: visitor,
            blogReviewCount: blog,
            visitorDelta,
            blogDelta,
            isEstimated: false,
          },
          create: {
            storeId: c.storeId,
            competitorPlaceId: c.competitorPlaceId!,
            date,
            visitorReviewCount: visitor,
            blogReviewCount: blog,
            visitorDelta,
            blogDelta,
            isEstimated: false,
          },
        });
      } catch (e: any) {
        this.logger.warn(`[경쟁사 ${c.competitorName}] 스냅샷 실패: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // 키워드 일별 검색량 (모든 고유 키워드 — 매장 중복 제거)
  async collectKeywordVolumes(date: Date) {
    const rows = await this.prisma.storeKeyword.findMany({
      select: { keyword: true },
      distinct: ["keyword"],
    });
    const keywords = rows.map((r) => r.keyword);
    if (keywords.length === 0) return;

    const BATCH = 5;
    for (let i = 0; i < keywords.length; i += BATCH) {
      const batch = keywords.slice(i, i + BATCH);
      const cleaned = batch.map((k) => k.replace(/\s+/g, "").replace(/,/g, ""));
      try {
        const stats = await this.searchad.getKeywordStats(cleaned);
        for (const k of batch) {
          const clean = k.replace(/\s+/g, "").replace(/,/g, "");
          const s = stats.find((x) => x.relKeyword === clean);
          if (!s) continue;
          const pc = this.toNum(s.monthlyPcQcCnt);
          const mobile = this.toNum(s.monthlyMobileQcCnt);
          const total = pc + mobile;

          await this.prisma.keywordDailyVolume.upsert({
            where: { keyword_date: { keyword: k, date } },
            update: { pcVolume: pc, mobileVolume: mobile, totalVolume: total },
            create: { keyword: k, date, pcVolume: pc, mobileVolume: mobile, totalVolume: total },
          });
        }
      } catch (e: any) {
        this.logger.warn(`키워드 볼륨 배치 실패 [${batch.join(",")}]: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    this.logger.log(`키워드 일별 검색량 ${keywords.length}개 수집 완료`);
  }

  private todayDate(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private toNum(v: any): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const lt = v.match(/<\s*(\d+)/);
      if (lt) return Math.floor(parseInt(lt[1]) / 2);
      const n = parseInt(v.replace(/[^0-9]/g, ""));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
}
