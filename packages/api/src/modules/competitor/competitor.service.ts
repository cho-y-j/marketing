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
    const competitor = await this.prisma.competitor.create({
      data: {
        storeId,
        competitorName: dto.competitorName,
        competitorPlaceId: dto.competitorPlaceId,
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
