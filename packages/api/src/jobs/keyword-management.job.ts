import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.service";
import { findAutoAnalysisStores } from "../common/helpers/auto-analysis-targets.helper";
import { KeywordDiscoveryService } from "../modules/keyword/keyword-discovery.service";
import { KeywordService } from "../modules/keyword/keyword.service";
import { NotificationService } from "../modules/notification/notification.service";
import { AIProvider } from "../providers/ai/ai.provider";
import { NaverSearchadProvider } from "../providers/naver/naver-searchad.provider";

/**
 * 주간 키워드 자동 관리 배치잡.
 * 매주 월요일 03:00 실행.
 *
 * 1. 전 키워드 검색량 갱신
 * 2. 검색량 급감 키워드 감지 → 대체 키워드 추천 + 알림
 * 3. 시즌 키워드 자동 추가
 * 4. 히든 키워드 재탐색 → 새 발견 시 자동 등록
 * 5. 효과 없는 키워드 판별 → 알림
 */
@Injectable()
export class KeywordManagementJob {
  private readonly logger = new Logger(KeywordManagementJob.name);

  constructor(
    private prisma: PrismaService,
    private keywordDiscovery: KeywordDiscoveryService,
    private keywordService: KeywordService,
    private notificationService: NotificationService,
    private ai: AIProvider,
    private searchad: NaverSearchadProvider,
  ) {}

  @Cron("20 4 * * 1") // UTC 04:20 월 = 한국 월요일 13:20
  async weeklyKeywordManagement() {
    const stores = await findAutoAnalysisStores(this.prisma, {
      select: { id: true, name: true, userId: true, district: true, category: true },
      caller: "KeywordManagementJob",
    });

    this.logger.log(`[월요일 03:00] 키워드 관리 대상 ${stores.length}개 매장`);

    for (const store of stores) {
      try {
        await this.manageStoreKeywords(store);
      } catch (e: any) {
        this.logger.warn(`[${store.name}] 키워드 관리 실패: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async manageStoreKeywords(store: {
    id: string;
    name: string;
    userId: string;
    district: string | null;
    category: string | null;
  }) {
    this.logger.log(`[${store.name}] 키워드 관리 시작`);
    const alerts: string[] = [];

    // 1. 전 키워드 검색량 갱신
    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId: store.id },
    });

    for (const kw of keywords) {
      try {
        const stats = await this.searchad.getKeywordStats([kw.keyword.replace(/\s+/g, "")]);
        if (stats.length > 0) {
          const newVolume = this.searchad.getTotalMonthlySearch(stats[0]);
          const prevVolume = kw.monthlySearchVolume || 0;

          await this.prisma.storeKeyword.update({
            where: { id: kw.id },
            data: { monthlySearchVolume: newVolume, lastCheckedAt: new Date() },
          });

          // 검색량 30% 이상 급감 감지
          if (prevVolume > 100 && newVolume < prevVolume * 0.7) {
            const dropPct = Math.round((1 - newVolume / prevVolume) * 100);
            alerts.push(`"${kw.keyword}" 검색량 ${dropPct}% 감소 (${prevVolume.toLocaleString()}→${newVolume.toLocaleString()})`);

            // 트렌드 방향 업데이트
            await this.prisma.storeKeyword.update({
              where: { id: kw.id },
              data: {
                trendDirection: "DOWN",
                trendPercentage: -dropPct,
              },
            });
          } else if (prevVolume > 0 && newVolume > prevVolume * 1.3) {
            const upPct = Math.round((newVolume / prevVolume - 1) * 100);
            await this.prisma.storeKeyword.update({
              where: { id: kw.id },
              data: {
                trendDirection: "UP",
                trendPercentage: upPct,
              },
            });
          } else {
            await this.prisma.storeKeyword.update({
              where: { id: kw.id },
              data: { trendDirection: "STABLE", trendPercentage: 0 },
            });
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch {}
    }

    // 2. 시즌 키워드 자동 추가
    const seasonalAdded = await this.addSeasonalKeywords(store);
    if (seasonalAdded.length > 0) {
      alerts.push(`시즌 키워드 ${seasonalAdded.length}개 자동 추가: ${seasonalAdded.join(", ")}`);
    }

    // 3. 히든 키워드 재탐색
    let hiddenAdded = 0;
    try {
      const discovery = await this.keywordDiscovery.discoverKeywords(store.id);
      const existingKws = new Set(keywords.map((k) => k.keyword));

      for (const hidden of discovery.hidden) {
        if (existingKws.has(hidden.keyword)) continue;
        try {
          await this.prisma.storeKeyword.create({
            data: {
              storeId: store.id,
              keyword: hidden.keyword,
              type: "HIDDEN",
              monthlySearchVolume: hidden.monthlyVolume || null,
              lastCheckedAt: new Date(),
            },
          });
          hiddenAdded++;
        } catch {}
      }
      if (hiddenAdded > 0) {
        alerts.push(`새 히든 키워드 ${hiddenAdded}개 발견`);
      }
    } catch {}

    // 4. 효과 없는 키워드 판별 (순위 데이터 2주 이상 + 순위 50위 밖)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const ineffective = keywords.filter((kw) => {
      return (
        kw.currentRank === null &&
        kw.lastCheckedAt &&
        kw.lastCheckedAt < twoWeeksAgo &&
        (kw.monthlySearchVolume === null || kw.monthlySearchVolume < 50)
      );
    });
    if (ineffective.length > 0) {
      alerts.push(
        `효과 낮은 키워드 ${ineffective.length}개: ${ineffective.map((k) => `"${k.keyword}"`).join(", ")} — 대체 키워드를 추천합니다`,
      );
    }

    // 5. 알림 발송
    if (alerts.length > 0) {
      await this.notificationService.create(store.userId, {
        type: "KEYWORD_WEEKLY",
        title: `${store.name} 주간 키워드 리포트`,
        message: alerts.join(" | "),
        data: { alerts, hiddenAdded, seasonalAdded: seasonalAdded.length },
      });
    }

    this.logger.log(
      `[${store.name}] 키워드 관리 완료: 갱신 ${keywords.length}개, 시즌 +${seasonalAdded.length}, 히든 +${hiddenAdded}, 알림 ${alerts.length}건`,
    );
  }

  // 시즌 키워드 자동 추가
  private async addSeasonalKeywords(store: {
    id: string;
    district: string | null;
    category: string | null;
  }): Promise<string[]> {
    const month = new Date().getMonth() + 1; // 1~12
    const district = store.district || "";
    const category = store.category || "맛집";

    // 월별 시즌 키워드 매핑
    const seasonMap: Record<number, string[]> = {
      1: ["신년 모임", "새해 맛집", "겨울 맛집"],
      2: ["발렌타인 맛집", "겨울 데이트"],
      3: ["봄 맛집", "졸업 맛집", "봄나들이"],
      4: ["벚꽃 맛집", "봄 데이트", "야외 맛집"],
      5: ["가정의달 맛집", "어버이날 맛집", "봄 나들이"],
      6: ["여름 맛집", "시원한 맛집", "냉면 맛집"],
      7: ["여름 데이트", "휴가 맛집", "바캉스 맛집"],
      8: ["여름 맛집", "피서지 맛집"],
      9: ["가을 맛집", "추석 맛집"],
      10: ["가을 데이트", "단풍 맛집"],
      11: ["겨울 맛집", "수능 끝 맛집", "연말 모임"],
      12: ["크리스마스 맛집", "연말 회식", "송년회"],
    };

    const seasonKeys = seasonMap[month] || [];
    const added: string[] = [];
    const existingKws = new Set(
      (await this.prisma.storeKeyword.findMany({
        where: { storeId: store.id },
        select: { keyword: true },
      })).map((k) => k.keyword),
    );

    for (const base of seasonKeys.slice(0, 2)) {
      const keyword = district ? `${district} ${base}` : base;
      if (existingKws.has(keyword)) continue;

      try {
        await this.prisma.storeKeyword.create({
          data: {
            storeId: store.id,
            keyword,
            type: "SEASONAL",
            lastCheckedAt: new Date(),
          },
        });
        added.push(keyword);

        // 검색량 조회
        try {
          const stats = await this.searchad.getKeywordStats([keyword.replace(/\s+/g, "")]);
          if (stats.length > 0) {
            await this.prisma.storeKeyword.updateMany({
              where: { storeId: store.id, keyword },
              data: { monthlySearchVolume: this.searchad.getTotalMonthlySearch(stats[0]) },
            });
          }
        } catch {}
      } catch {}
    }

    return added;
  }
}
