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
  async findAllWithCompetition(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, naverPlaceId: true },
    });
    if (!store) return [];

    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
      orderBy: [
        { currentRank: "asc" }, // null이 뒤로
        { monthlySearchVolume: "desc" },
      ],
    });

    // 각 키워드의 최신 RankHistory에서 topPlaces 가져오기
    const enriched = await Promise.all(
      keywords.map(async (kw) => {
        const latest = await this.prisma.keywordRankHistory.findFirst({
          where: { storeId, keyword: kw.keyword },
          orderBy: { checkedAt: "desc" },
          select: { topPlaces: true, totalResults: true, checkedAt: true },
        });

        const allPlaces: any[] = (latest?.topPlaces as any[]) || [];

        // Top 3
        const top3 = allPlaces.slice(0, 3).map((p) => ({
          rank: p.rank,
          name: p.name,
          placeId: p.placeId,
          visitorReviewCount: p.visitorReviewCount,
          blogReviewCount: p.blogReviewCount,
          isMine: p.isMine,
        }));

        // 내 매장 정보 (Top 3 안에 있을 수도, 밖에 있을 수도)
        const myPlace = allPlaces.find((p: any) => p.isMine);

        // 일/주/월 검색량 계산
        const monthly = kw.monthlySearchVolume ?? 0;
        // 순위 변동 (어제 대비) — previousRank와 currentRank 차이
        const rankChange =
          kw.previousRank != null && kw.currentRank != null
            ? kw.previousRank - kw.currentRank // 양수 = 상승
            : null;
        return {
          ...kw,
          monthlyVolume: monthly,
          weeklyVolume: monthly > 0 ? Math.round(monthly / 4.3) : 0,
          dailyVolume: monthly > 0 ? Math.round(monthly / 30) : 0,
          totalResults: latest?.totalResults ?? null,
          checkedAt: latest?.checkedAt ?? null,
          rankChange,
          top3,
          myPlace: myPlace || null,
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
