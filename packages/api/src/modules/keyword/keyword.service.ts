import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { CreateKeywordDto } from "./dto/keyword.dto";
import { KeywordType } from "@prisma/client";
import { isLowVolumeNonException, isNonRegional } from "./keyword-filter.util";

@Injectable()
export class KeywordService {
  private readonly logger = new Logger(KeywordService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
  ) {}

  async findAll(storeId: string) {
    return this.prisma.storeKeyword.findMany({
      where: { storeId },
      orderBy: { monthlySearchVolume: "desc" },
    });
  }

  /**
   * 키워드 검색량 미리보기 (추가 전 조회)
   * 일/주/월 검색량 + PC/모바일 분리
   */
  async previewVolume(keyword: string) {
    const cleanKw = keyword.replace(/\s+/g, "").replace(/,/g, "");
    try {
      const stats = await this.searchad.getKeywordStats([cleanKw]);
      const exact = stats.find((s) => s.relKeyword === cleanKw) || stats[0];
      if (!exact) {
        return { keyword, monthly: 0, weekly: 0, daily: 0, pc: 0, mobile: 0, available: false };
      }
      const pc = exact.monthlyPcQcCnt ?? 0;
      const mobile = exact.monthlyMobileQcCnt ?? 0;
      const monthly = pc + mobile;
      return {
        keyword,
        monthly,
        weekly: Math.round(monthly / 4.3),
        daily: Math.round(monthly / 30),
        pc,
        mobile,
        competition: exact.compIdx || "",
        available: monthly > 0,
      };
    } catch (e: any) {
      this.logger.warn(`검색량 미리보기 실패 [${keyword}]: ${e.message}`);
      return { keyword, monthly: 0, weekly: 0, daily: 0, pc: 0, mobile: 0, available: false };
    }
  }

  /**
   * 키워드 목록 + 각 키워드의 Top 3 매장 + 내 매장 정보 (한 번에 반환)
   * 키워드 페이지 메인 카드용
   */
  async findAllWithCompetition(storeId: string, compareDate?: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, naverPlaceId: true },
    });
    if (!store) return [];

    // compareDate 가 주어지면 그 날짜 row 와 비교 (rankChangeCustom 추가).
    // YYYY-MM-DD 포맷, 잘못된 입력은 무시.
    const compareDateObj = (() => {
      if (!compareDate) return null;
      const m = compareDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return isNaN(d.getTime()) ? null : d;
    })();

    let keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
      orderBy: [
        { currentRank: "asc" }, // null이 뒤로
        { monthlySearchVolume: "desc" },
      ],
    });

    // 검색량 누락된 키워드 lazy fill — 일/주/월 표기가 항상 의미 있는 숫자를 갖도록
    const missing = keywords.filter(
      (k) => k.monthlySearchVolume == null || k.monthlySearchVolume === 0,
    );
    if (missing.length > 0) {
      await this.backfillMonthlyVolumes(missing.map((k) => ({ id: k.id, keyword: k.keyword })));
      keywords = await this.prisma.storeKeyword.findMany({
        where: { storeId },
        orderBy: [
          { currentRank: "asc" },
          { monthlySearchVolume: "desc" },
        ],
      });
    }

    // 1d/7d/30d 비교용 기준일 — 오늘 UTC 자정에서 -1, -7, -30
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const date1d = new Date(todayUtc);
    date1d.setUTCDate(date1d.getUTCDate() - 1);
    const date7d = new Date(todayUtc);
    date7d.setUTCDate(date7d.getUTCDate() - 7);
    const date30d = new Date(todayUtc);
    date30d.setUTCDate(date30d.getUTCDate() - 30);

    // 내 매장 — StoreDailySnapshot 의 1일전/7일전/30일전 visitor/blog (백필 추정값 또는 실측)
    const myStoreSnaps = await this.prisma.storeDailySnapshot.findMany({
      where: { storeId, date: { in: [date1d, date7d, date30d] } },
      select: { date: true, visitorReviewCount: true, blogReviewCount: true },
    });
    const mySnap1d = myStoreSnaps.find((s) => s.date.getTime() === date1d.getTime()) ?? null;
    const mySnap7d = myStoreSnaps.find((s) => s.date.getTime() === date7d.getTime()) ?? null;
    const mySnap30d = myStoreSnaps.find((s) => s.date.getTime() === date30d.getTime()) ?? null;

    // 모든 키워드의 latest KeywordRankHistory 한 번에 모음 (top3 placeId 합집합 추출용)
    const latestPerKw = await Promise.all(
      keywords.map((kw) =>
        this.prisma.keywordRankHistory.findFirst({
          where: { storeId, keyword: kw.keyword },
          orderBy: { checkedAt: "desc" },
          select: { topPlaces: true, totalResults: true, checkedAt: true, rank: true },
        }),
      ),
    );
    const latestMap = new Map<string, (typeof latestPerKw)[number]>();
    keywords.forEach((kw, i) => latestMap.set(kw.keyword, latestPerKw[i]));

    // 모든 top3 의 competitorPlaceId 합집합 — CompetitorDailySnapshot 한 번에 조회
    const allPlaceIds = new Set<string>();
    for (const l of latestPerKw) {
      const tp = (l?.topPlaces as any[]) ?? [];
      for (const p of tp.slice(0, 3)) {
        if (p.placeId && !p.isMine) allPlaceIds.add(p.placeId);
      }
      // myPlace (Top3 밖이어도) 도 placeId 있으면 포함 — 단, 내 매장은 StoreDailySnapshot 사용하니 제외
    }
    const compSnaps =
      allPlaceIds.size > 0
        ? await this.prisma.competitorDailySnapshot.findMany({
            where: {
              storeId,
              competitorPlaceId: { in: [...allPlaceIds] },
              date: { in: [date1d, date7d, date30d] },
            },
            select: {
              date: true,
              competitorPlaceId: true,
              visitorReviewCount: true,
              blogReviewCount: true,
            },
          })
        : [];
    const compMap1d = new Map<string, { visitor: number | null; blog: number | null }>();
    const compMap7d = new Map<string, { visitor: number | null; blog: number | null }>();
    const compMap30d = new Map<string, { visitor: number | null; blog: number | null }>();
    for (const s of compSnaps) {
      const t = s.date.getTime();
      const target =
        t === date1d.getTime() ? compMap1d :
        t === date7d.getTime() ? compMap7d :
        t === date30d.getTime() ? compMap30d :
        null;
      if (target) {
        target.set(s.competitorPlaceId, {
          visitor: s.visitorReviewCount,
          blog: s.blogReviewCount,
        });
      }
    }

    // 키워드별 1일/7일/30일 순위 비교용 — KeywordRankHistory 의 N일전 row (순위만)
    //
    // 사장님 룰 (2026-04-30 정정):
    //  - 1일 = "어제와 비교" — latest 직전 row 가 아니라 오늘 자정 이전 마지막 row.
    //    같은 날 여러 번 체크돼도 27초 전 row 와 비교되지 않도록.
    //  - 7일/30일 = N일 전 ± 12시간 윈도우. compareDate 가 주어지면 그 날짜 row.
    const enriched = await Promise.all(
      keywords.map(async (kw) => {
        const latest = latestMap.get(kw.keyword) ?? null;

        // 1일 = 오늘 자정 이전 가장 최근 row. topPlaces 도 포함 (폴백 매칭용)
        const prev1d = latest
          ? await (async () => {
              const todayStart = new Date(latest.checkedAt);
              todayStart.setHours(0, 0, 0, 0);
              return this.prisma.keywordRankHistory.findFirst({
                where: {
                  storeId, keyword: kw.keyword,
                  checkedAt: { lt: todayStart },
                },
                orderBy: { checkedAt: "desc" },
                select: { rank: true, checkedAt: true, topPlaces: true },
              });
            })()
          : null;
        const findPrevByDays = async (daysAgo: number) => {
          if (!latest) return null;
          const t = new Date(latest.checkedAt.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          return this.prisma.keywordRankHistory.findFirst({
            where: {
              storeId, keyword: kw.keyword,
              checkedAt: {
                gte: new Date(t.getTime() - 12 * 60 * 60 * 1000),
                lte: new Date(t.getTime() + 12 * 60 * 60 * 1000),
              },
            },
            orderBy: { checkedAt: "desc" },
            select: { rank: true, topPlaces: true },
          });
        };
        const [prev7d, prev30d] = await Promise.all([
          findPrevByDays(7),
          findPrevByDays(30),
        ]);

        // 사용자가 달력으로 임의 날짜 선택 시 — 그 날짜의 가장 가까운 row (00:00 ~ 23:59 윈도우)
        const prevCustom = compareDateObj
          ? await (async () => {
              const dayStart = new Date(compareDateObj);
              dayStart.setUTCHours(0, 0, 0, 0);
              const dayEnd = new Date(compareDateObj);
              dayEnd.setUTCHours(23, 59, 59, 999);
              return this.prisma.keywordRankHistory.findFirst({
                where: {
                  storeId, keyword: kw.keyword,
                  checkedAt: { gte: dayStart, lte: dayEnd },
                },
                orderBy: { checkedAt: "desc" },
                select: { rank: true, checkedAt: true, topPlaces: true },
              });
            })()
          : null;

        const allPlaces: any[] = (latest?.topPlaces as any[]) || [];

        // KeywordRankHistory.topPlaces 폴백 맵 — placeId → visitor/blog
        // 사장님 룰: 등록 경쟁사 외에도 키워드 Top70 안 모든 매장의 변동을 보여줌.
        // pcmap 1회 호출에 visitor/blog 함께 옴 → 추가 수집 비용 0.
        const buildPlaceCountMap = (
          tp: any[] | null | undefined,
        ): Map<string, { visitor: number | null; blog: number | null }> => {
          const m = new Map<string, { visitor: number | null; blog: number | null }>();
          for (const p of tp ?? []) {
            const id = p?.placeId;
            if (!id) continue;
            m.set(String(id), {
              visitor: typeof p.visitorReviewCount === "number" ? p.visitorReviewCount : null,
              blog: typeof p.blogReviewCount === "number" ? p.blogReviewCount : null,
            });
          }
          return m;
        };
        const kwHist1d = buildPlaceCountMap((prev1d?.topPlaces as any[]) || []);
        const kwHist7d = buildPlaceCountMap((prev7d?.topPlaces as any[]) || []);
        const kwHist30d = buildPlaceCountMap((prev30d?.topPlaces as any[]) || []);

        // 각 place 의 1/7/30일 visitor·blog 델타.
        // 우선순위 (사장님 룰): 1) 내 매장 = StoreDailySnapshot
        //                       2) 등록 경쟁사 = CompetitorDailySnapshot (정밀 실측)
        //                       3) 그 외 모든 Top70 매장 = KeywordRankHistory.topPlaces 폴백
        const computeDelta = (p: any) => {
          const past = (
            d: 1 | 7 | 30,
          ): { visitor: number | null; blog: number | null } => {
            if (p.isMine) {
              const s = d === 1 ? mySnap1d : d === 7 ? mySnap7d : mySnap30d;
              return {
                visitor: s?.visitorReviewCount ?? null,
                blog: s?.blogReviewCount ?? null,
              };
            }
            if (!p.placeId) return { visitor: null, blog: null };
            // 1순위: 등록 경쟁사 DailySnapshot
            const compMap = d === 1 ? compMap1d : d === 7 ? compMap7d : compMap30d;
            const c = compMap.get(p.placeId);
            if (c && (c.visitor != null || c.blog != null)) {
              return { visitor: c.visitor ?? null, blog: c.blog ?? null };
            }
            // 2순위 (폴백): KeywordRankHistory.topPlaces 안의 같은 시점 카운트
            const kwMap = d === 1 ? kwHist1d : d === 7 ? kwHist7d : kwHist30d;
            const k = kwMap.get(String(p.placeId));
            return { visitor: k?.visitor ?? null, blog: k?.blog ?? null };
          };
          const subtract = (
            cur: number | null | undefined,
            prev: number | null | undefined,
          ) => (cur != null && prev != null ? cur - prev : null);
          const p1 = past(1), p7 = past(7), p30 = past(30);
          return {
            visitorDelta: subtract(p.visitorReviewCount, p1.visitor),
            blogDelta: subtract(p.blogReviewCount, p1.blog),
            visitorDelta7d: subtract(p.visitorReviewCount, p7.visitor),
            blogDelta7d: subtract(p.blogReviewCount, p7.blog),
            visitorDelta30d: subtract(p.visitorReviewCount, p30.visitor),
            blogDelta30d: subtract(p.blogReviewCount, p30.blog),
          };
        };

        const top3 = allPlaces.slice(0, 3).map((p) => ({
          rank: p.rank,
          name: p.name,
          placeId: p.placeId,
          visitorReviewCount: p.visitorReviewCount,
          blogReviewCount: p.blogReviewCount,
          ...computeDelta(p),
          isMine: p.isMine,
        }));

        // 내 매장 정보 (Top 3 안에 있을 수도, 밖에 있을 수도) + 1d/7d delta
        const myRaw = allPlaces.find((p: any) => p.isMine);
        const myPlace = myRaw
          ? {
              rank: myRaw.rank,
              name: myRaw.name,
              placeId: myRaw.placeId,
              visitorReviewCount: myRaw.visitorReviewCount,
              blogReviewCount: myRaw.blogReviewCount,
              ...computeDelta(myRaw),
              isMine: true,
            }
          : null;

        // 일/주/월 검색량 — 네이버 검색광고 API는 월간만 제공하므로 주/일은 선형 환산(추정).
        // 실제 수집되는 KeywordDailyVolume.totalVolume 도 "그 날 기록한 월간 검색량"이라
        // 주/일 단위 분해에 쓸 수 없음. 따라서 항상 volumeEstimated=true.
        const monthly = kw.monthlySearchVolume ?? 0;
        const weeklyVolume = monthly > 0 ? Math.round(monthly / 4.3) : 0;
        const dailyVolume = monthly > 0 ? Math.round(monthly / 30) : 0;
        const volumeEstimated = monthly > 0;

        // 순위 변동 — 1일/7일/30일 분리. 양수 = 상승(좋아짐), 음수 = 하락(나빠짐).
        const currRank = kw.currentRank ?? latest?.rank ?? null;
        const sub = (cur: number | null, prev: number | null) =>
          cur != null && prev != null ? prev - cur : null;
        return {
          ...kw,
          monthlyVolume: monthly,
          weeklyVolume,
          dailyVolume,
          volumeEstimated,
          totalResults: latest?.totalResults ?? null,
          checkedAt: latest?.checkedAt ?? null,
          rankChange: sub(currRank, prev1d?.rank ?? null),
          rankChange7d: sub(currRank, prev7d?.rank ?? null),
          rankChange30d: sub(currRank, prev30d?.rank ?? null),
          rankChangeCustom: prevCustom ? sub(currRank, prevCustom.rank ?? null) : null,
          compareDate: compareDateObj ? compareDateObj.toISOString().slice(0, 10) : null,
          top3,
          myPlace,
        };
      }),
    );

    return enriched;
  }

  async getRecommended(storeId: string) {
    return this.prisma.storeKeyword.findMany({
      where: { storeId, type: "AI_RECOMMENDED" },
      orderBy: { monthlySearchVolume: "desc" },
    });
  }

  async getTrends(storeId: string) {
    return this.prisma.storeKeyword.findMany({
      where: { storeId, trendDirection: { not: null } },
      orderBy: { trendPercentage: "desc" },
    });
  }

  async create(storeId: string, dto: CreateKeywordDto) {
    const keyword = await this.prisma.storeKeyword.create({
      data: {
        storeId,
        keyword: dto.keyword,
        type: (dto.type as KeywordType) || "USER_ADDED",
      },
    });

    // 비동기로 검색량 조회 (응답 블로킹하지 않음)
    this.fetchSearchVolume(keyword.id, dto.keyword);

    return keyword;
  }

  // 누락된 월간 검색량 배치 채우기 (5개씩, 최대 20개까지만 — 응답 지연 방지)
  private async backfillMonthlyVolumes(items: Array<{ id: string; keyword: string }>) {
    const LIMIT = 20;
    const BATCH = 5;
    const targets = items.slice(0, LIMIT);
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const cleaned = batch.map((b) => b.keyword.replace(/\s+/g, "").replace(/,/g, ""));
      try {
        const stats = await this.searchad.getKeywordStats(cleaned);
        await Promise.all(
          batch.map((b) => {
            const clean = b.keyword.replace(/\s+/g, "").replace(/,/g, "");
            const match = stats.find((s) => s.relKeyword === clean);
            const volume = match ? this.searchad.getTotalMonthlySearch(match) : 0;
            return this.prisma.storeKeyword.update({
              where: { id: b.id },
              data: { monthlySearchVolume: volume, lastCheckedAt: new Date() },
            });
          }),
        );
      } catch (e: any) {
        this.logger.warn(`검색량 배치 채우기 실패: ${e.message}`);
      }
    }
  }

  // 키워드 검색량 자동 조회
  private async fetchSearchVolume(keywordId: string, keyword: string) {
    try {
      // 공백 제거 버전으로도 시도 (네이버 검색광고 API는 공백 없는 키워드 선호)
      const searchTerm = keyword.replace(/\s+/g, "");
      const stats = await this.searchad.getKeywordStats([searchTerm]);

      if (stats.length > 0) {
        // 정확 매칭 또는 첫 번째 결과 사용
        const match = stats.find(
          (s) => s.relKeyword === searchTerm || s.relKeyword === keyword,
        ) || stats[0];

        const volume = this.searchad.getTotalMonthlySearch(match);

        await this.prisma.storeKeyword.update({
          where: { id: keywordId },
          data: {
            monthlySearchVolume: volume,
            lastCheckedAt: new Date(),
          },
        });

        this.logger.log(`검색량 조회: "${keyword}" = ${volume.toLocaleString()}회/월`);
      }
    } catch (e: any) {
      this.logger.warn(`검색량 조회 실패 [${keyword}]: ${e.message}`);
    }
  }

  // 키워드 제외 (storeKeyword 삭제 + ExcludedKeyword 기록)
  async excludeKeyword(storeId: string, keywordId: string, reason?: string) {
    const kw = await this.prisma.storeKeyword.findFirst({
      where: { id: keywordId, storeId },
    });
    if (!kw) return { ok: false, message: "키워드를 찾을 수 없음" };

    await this.prisma.$transaction([
      this.prisma.storeKeyword.delete({ where: { id: keywordId } }),
      this.prisma.excludedKeyword.upsert({
        where: { storeId_keyword: { storeId, keyword: kw.keyword } },
        update: { reason: reason || "사용자 판단", excludedAt: new Date() },
        create: { storeId, keyword: kw.keyword, reason: reason || "사용자 판단" },
      }),
    ]);
    return { ok: true, keyword: kw.keyword };
  }

  /**
   * 매장 키워드 정리 — 의뢰자 규칙 일괄 적용.
   *  1) 월 300 미만 + 회식/상견례/룸 예외 아닌 것 제거
   *  2) USER_ADDED 외 타입 중 지역성 결여 키워드 제거
   * 반환: { removed: string[], kept: number }
   */
  async cleanupByRules(storeId: string): Promise<{ removed: string[]; kept: number }> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, district: true, address: true },
    });
    if (!store) return { removed: [], kept: 0 };

    const all = await this.prisma.storeKeyword.findMany({
      where: { storeId, type: { not: "USER_ADDED" } },
      select: { id: true, keyword: true, monthlySearchVolume: true, type: true },
    });

    // 지역 토큰 후보 — 동/구/역 접미사 + 매장명 지명 힌트(공덕 등)
    const tokens = this.extractRegionTokens(store.district, store.address, store.name);

    const toRemoveIds: string[] = [];
    const removedNames: string[] = [];
    for (const kw of all) {
      let shouldRemove = false;
      let reason = "";
      if (isLowVolumeNonException(kw.keyword, kw.monthlySearchVolume)) {
        shouldRemove = true;
        reason = `월${kw.monthlySearchVolume}<300`;
      } else if (isNonRegional(kw.keyword, tokens)) {
        // USER_ADDED 외에만 적용 (HIDDEN/MAIN/AI 오염 정리)
        shouldRemove = true;
        reason = "지역성결여";
      }
      if (shouldRemove) {
        toRemoveIds.push(kw.id);
        removedNames.push(`${kw.keyword}(${reason})`);
      }
    }

    if (toRemoveIds.length > 0) {
      await this.prisma.storeKeyword.deleteMany({ where: { id: { in: toRemoveIds } } });
      this.logger.log(`[cleanup ${store.name}] ${toRemoveIds.length}개 제거: ${removedNames.join(", ")}`);
    }
    return { removed: removedNames, kept: all.length - toRemoveIds.length };
  }

  private extractRegionTokens(
    district: string | null,
    address: string | null,
    storeName?: string | null,
  ): string[] {
    const tokens = new Set<string>();
    const all = `${district ?? ""} ${address ?? ""}`;
    // 동/구/시 + 앞글자(역 조합 대응)
    const matches = all.match(/[가-힣]{2,}(동|구|시|읍|면)/g) ?? [];
    for (const m of matches) {
      tokens.add(m);
      tokens.add(m.replace(/(동|구|시|읍|면)$/, ""));
    }
    // 매장명 지명 힌트 (예: "찬란한아구 공덕직영점" → "공덕")
    // lazy quantifier로 최소 매치 우선 ("공덕직영점"에서 "공덕직영"이 아닌 "공덕" 추출)
    if (storeName) {
      const brandHint = storeName.match(/([가-힣]{2,4}?)(직영점|역점|지점|점)/)?.[1];
      if (brandHint) {
        tokens.add(brandHint);
        tokens.add(`${brandHint}역`);
      }
    }
    return Array.from(tokens).filter((t) => t.length >= 2);
  }

  async listExcluded(storeId: string) {
    return this.prisma.excludedKeyword.findMany({
      where: { storeId },
      orderBy: { excludedAt: "desc" },
    });
  }

  async removeExclusion(storeId: string, excludedId: string) {
    const ex = await this.prisma.excludedKeyword.findFirst({
      where: { id: excludedId, storeId },
    });
    if (!ex) return { ok: false };
    await this.prisma.excludedKeyword.delete({ where: { id: excludedId } });
    return { ok: true, keyword: ex.keyword };
  }

  // 기존 키워드들의 검색량 일괄 업데이트
  async refreshAllSearchVolumes(storeId: string) {
    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
    });

    for (const kw of keywords) {
      await this.fetchSearchVolume(kw.id, kw.keyword);
      await new Promise((r) => setTimeout(r, 500)); // Rate limit
    }

    return { updated: keywords.length };
  }
}
