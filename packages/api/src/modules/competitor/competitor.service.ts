import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { NaverSearchProvider } from "../../providers/naver/naver-search.provider";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { CreateCompetitorDto } from "./dto/competitor.dto";

@Injectable()
export class CompetitorService {
  private readonly logger = new Logger(CompetitorService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private naverSearch: NaverSearchProvider,
    private naverPlace: NaverPlaceProvider,
  ) {}

  async findAll(storeId: string) {
    return this.prisma.competitor.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(storeId: string, dto: CreateCompetitorDto) {
    // B안: placeId 없으면 저장 전에 네이버 검색으로 확보 시도 — 일별 스냅샷·비교 분석 모두 placeId 기반이라 필수
    let placeId = dto.competitorPlaceId;
    if (!placeId) {
      placeId = (await this.resolvePlaceId(dto.competitorName, dto.competitorUrl)) ?? undefined;
      if (placeId) {
        this.logger.log(`[경쟁사 추가] placeId 자동 획득: ${dto.competitorName} → ${placeId}`);
      } else {
        this.logger.warn(`[경쟁사 추가] placeId 획득 실패: ${dto.competitorName} — 일별 비교 불가, 재보강 cron 대기`);
      }
    }

    const competitor = await this.prisma.competitor.create({
      data: {
        storeId,
        competitorName: dto.competitorName,
        competitorPlaceId: placeId,
        competitorUrl: dto.competitorUrl,
        category: dto.category,
        type: "USER_SET",
      },
    });

    this.collectCompetitorData(competitor.id, dto.competitorName).catch((e) =>
      this.logger.warn(`경쟁매장 데이터 수집 실패 [${dto.competitorName}]: ${e.message}`),
    );

    return competitor;
  }

  /**
   * 매장명 + URL 로 네이버 placeId 획득 시도.
   * 순서: 1) URL 직접 파싱 → 2) 검색 API 결과의 link → 3) HTML searchAndGetPlaceInfo 폴백
   * 실패 시 null.
   */
  private async resolvePlaceId(name: string, url?: string | null): Promise<string | null> {
    // 1) URL 직접 파싱
    if (url) {
      const fromUrl = this.naverPlace.extractPlaceIdFromUrl(url);
      if (fromUrl) return fromUrl;
    }
    // 2) 네이버 검색 API → 결과 link에서 추출
    try {
      const places = await this.naverSearch.searchPlace(name, 3);
      for (const p of places) {
        const cleanTitle = p.title.replace(/<[^>]*>/g, "");
        const matched =
          cleanTitle.replace(/\s+/g, "") === name.replace(/\s+/g, "") ||
          cleanTitle.includes(name) ||
          name.includes(cleanTitle);
        if (matched) {
          const extracted = this.naverPlace.extractPlaceIdFromUrl(p.link || "");
          if (extracted) return extracted;
        }
      }
    } catch {}
    // 3) HTML 파싱 폴백 (Chrome 없이 axios)
    try {
      const info = await this.naverPlace.searchAndGetPlaceInfo(name);
      if (info?.id) return info.id;
    } catch {}
    return null;
  }

  /**
   * A안: competitorPlaceId 가 NULL 인 경쟁사들을 재검색으로 보강.
   * 슈퍼관리자 or cron 에서 호출.
   * @returns { total, filled, stillMissing }
   */
  async backfillNullPlaceIds(storeId?: string) {
    const competitors = await this.prisma.competitor.findMany({
      where: {
        competitorPlaceId: null,
        ...(storeId ? { storeId } : {}),
      },
      select: { id: true, competitorName: true, competitorUrl: true },
    });

    let filled = 0;
    const stillMissing: string[] = [];
    for (const c of competitors) {
      const placeId = await this.resolvePlaceId(c.competitorName, c.competitorUrl);
      if (placeId) {
        await this.prisma.competitor.update({
          where: { id: c.id },
          data: { competitorPlaceId: placeId, lastComparedAt: new Date() },
        });
        // 확보했으면 데이터 수집도 다시 시도
        this.collectCompetitorData(c.id, c.competitorName).catch(() => {});
        filled++;
        this.logger.log(`[보강] ${c.competitorName} → placeId ${placeId}`);
      } else {
        stillMissing.push(c.competitorName);
        this.logger.warn(`[보강 실패] ${c.competitorName} — 네이버 검색 결과 없음`);
      }
      await new Promise((r) => setTimeout(r, 1000)); // rate-limit
    }

    return { total: competitors.length, filled, stillMissing };
  }

  async remove(storeId: string, competitorId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id: competitorId, storeId },
    });
    if (!competitor) throw new NotFoundException("경쟁 매장을 찾을 수 없습니다");

    // 연관 히스토리 먼저 삭제
    await this.prisma.competitorHistory.deleteMany({
      where: { competitorId },
    });

    return this.prisma.competitor.delete({ where: { id: competitorId } });
  }

  // 경쟁 비교 분석 데이터
  async getComparison(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: { take: 5, orderBy: { monthlySearchVolume: "desc" } },
      },
    });
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId },
    });

    const myAnalysis = store?.analyses?.[0];
    return {
      store: {
        name: store?.name,
        address: store?.address,
        category: store?.category,
        competitiveScore: store?.competitiveScore,
        blogReviewCount: myAnalysis?.blogReviewCount ?? 0,
        receiptReviewCount: myAnalysis?.receiptReviewCount ?? 0,
        dailySearchVolume: myAnalysis?.dailySearchVolume ?? 0,
        saveCount: myAnalysis?.saveCount ?? 0,
      },
      competitors: competitors.map((c) => ({
        id: c.id,
        name: c.competitorName,
        placeId: c.competitorPlaceId,
        type: c.type,
        blogReviewCount: c.blogReviewCount ?? 0,
        receiptReviewCount: c.receiptReviewCount ?? 0,
        dailySearchVolume: c.dailySearchVolume ?? 0,
      })),
      keywords: store?.keywords?.map((k) => ({
        keyword: k.keyword,
        volume: k.monthlySearchVolume,
        rank: k.currentRank,
      })),
    };
  }

  // 경쟁매장 전체 데이터 새로고침 + 변동 감지
  async refreshAll(storeId: string) {
    const competitors = await this.prisma.competitor.findMany({ where: { storeId } });
    let updated = 0;
    const allChanges: Array<{ type: string; name: string; detail: string }> = [];

    for (const c of competitors) {
      try {
        const result = await this.collectCompetitorData(c.id, c.competitorName);
        if (result?.changes?.length) {
          allChanges.push(...result.changes);
        }
        updated++;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    return { updated, total: competitors.length, changes: allChanges };
  }

  // 경쟁매장 실데이터 수집 (네이버 API 기반 — Chrome 불필요)
  private async collectCompetitorData(competitorId: string, name: string) {
    this.logger.log(`경쟁매장 데이터 수집: ${name}`);

    let blogReviewCount = 0;
    let receiptReviewCount = 0;
    let searchVolume = 0;
    let placeId: string | undefined;

    // 1. 검색광고 API로 일 검색량
    try {
      const stats = await this.searchad.getKeywordStats([name.replace(/\s+/g, "")]);
      if (stats.length > 0) {
        searchVolume = Math.round(this.searchad.getTotalMonthlySearch(stats[0]) / 30);
      }
    } catch {}

    // 2. 네이버 검색 API로 카테고리 + placeId 추출
    try {
      const places = await this.naverSearch.searchPlace(name, 3);
      const match = places.find((p) =>
        p.title.replace(/<[^>]*>/g, "").includes(name.replace(/\s+/g, "")) ||
        name.includes(p.title.replace(/<[^>]*>/g, ""))
      );
      if (match) {
        const updateData: any = { lastComparedAt: new Date() };
        if (match.category) updateData.category = match.category;
        // link에서 placeId 추출
        const extractedId = this.naverPlace.extractPlaceIdFromUrl(match.link || "");
        if (extractedId) {
          placeId = extractedId;
          updateData.competitorPlaceId = placeId;
        }
        await this.prisma.competitor.update({
          where: { id: competitorId },
          data: updateData,
        });
      }
    } catch {}

    // 3. placeId가 있으면 맵 API로 리뷰 수 수집
    const existingComp = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
      select: { competitorPlaceId: true },
    });
    const effectivePlaceId = placeId || existingComp?.competitorPlaceId;

    if (effectivePlaceId) {
      try {
        const detail = await this.naverPlace.getPlaceDetail(effectivePlaceId);
        if (detail) {
          receiptReviewCount = detail.visitorReviewCount || 0;
          blogReviewCount = detail.blogReviewCount || 0;
        }
      } catch (e: any) {
        this.logger.debug(`경쟁매장 상세 API 실패 [${name}]: ${e.message}`);
      }
    }

    // 4. 맵 API도 실패 시 → allSearch 폴백
    if (receiptReviewCount === 0 && blogReviewCount === 0) {
      try {
        const placeInfo = await this.naverPlace.searchAndGetPlaceInfo(name);
        if (placeInfo) {
          receiptReviewCount = placeInfo.visitorReviewCount || 0;
          blogReviewCount = placeInfo.blogReviewCount || 0;
          if (!placeId && placeInfo.id) placeId = placeInfo.id;
        }
      } catch {}
    }

    // 변동 감지를 위해 이전 값 조회
    const prev = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
      select: { receiptReviewCount: true, blogReviewCount: true, storeId: true },
    });

    await this.prisma.competitor.update({
      where: { id: competitorId },
      data: {
        receiptReviewCount: receiptReviewCount || undefined,
        blogReviewCount: blogReviewCount || undefined,
        dailySearchVolume: searchVolume || undefined,
        lastComparedAt: new Date(),
      },
    });

    // CompetitorHistory에 일별 스냅샷 저장 (검색량이라도 있으면 기록)
    if (receiptReviewCount > 0 || blogReviewCount > 0 || searchVolume > 0) {
      await this.prisma.competitorHistory.create({
        data: {
          competitorId,
          receiptReviewCount: receiptReviewCount || null,
          blogReviewCount: blogReviewCount || null,
        },
      });
    }

    // 변동 감지: 리뷰 급증 (전일 대비 +5개 이상)
    const changes: Array<{ type: string; name: string; detail: string }> = [];
    if (prev && receiptReviewCount > 0) {
      const prevReceipt = prev.receiptReviewCount || 0;
      const diff = receiptReviewCount - prevReceipt;
      if (diff >= 5) {
        changes.push({
          type: "REVIEW_SURGE",
          name,
          detail: `방문자 리뷰 +${diff}개 (${prevReceipt}→${receiptReviewCount})`,
        });
      }
    }
    if (prev && blogReviewCount > 0) {
      const prevBlog = prev.blogReviewCount || 0;
      const diff = blogReviewCount - prevBlog;
      if (diff >= 5) {
        changes.push({
          type: "BLOG_SURGE",
          name,
          detail: `블로그 리뷰 +${diff}개 (${prevBlog}→${blogReviewCount})`,
        });
      }
    }

    this.logger.log(
      `경쟁매장 데이터 수집 완료: ${name} (리뷰:${receiptReviewCount}, 블로그:${blogReviewCount}, 검색:${searchVolume}/일)`,
    );

    return { storeId: prev?.storeId, changes };
  }
}
