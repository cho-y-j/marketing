import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { NaverSearchProvider } from "../../providers/naver/naver-search.provider";
import { CreateCompetitorDto } from "./dto/competitor.dto";

@Injectable()
export class CompetitorService {
  private readonly logger = new Logger(CompetitorService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private naverSearch: NaverSearchProvider,
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

    // 비동기로 경쟁매장 데이터 수집
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

  // 경쟁매장 전체 데이터 새로고침
  async refreshAll(storeId: string) {
    const competitors = await this.prisma.competitor.findMany({ where: { storeId } });
    let updated = 0;
    for (const c of competitors) {
      try {
        await this.collectCompetitorData(c.id, c.competitorName);
        updated++;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    return { updated, total: competitors.length };
  }

  // 네이버 검색 API로 경쟁매장 실데이터 수집
  private async collectCompetitorData(competitorId: string, name: string) {
    this.logger.log(`경쟁매장 데이터 수집: ${name}`);

    let blogReviewCount = 0;
    let receiptReviewCount = 0;
    let searchVolume = 0;

    // 1. 블로그 검색으로 블로그 리뷰 수 추정
    try {
      const blogs = await this.naverSearch.searchBlog(name, 1);
      // 블로그 검색 total 값은 직접 못 가져오므로 place 검색으로 보완
      blogReviewCount = blogs.length > 0 ? 1 : 0;
    } catch (e: any) {
      this.logger.warn(`블로그 검색 실패 [${name}]: ${e.message}`);
    }

    // 2. 장소 검색으로 매장 정보 + 리뷰 추정
    try {
      const places = await this.naverSearch.searchPlace(name, 3);
      const match = places.find((p) =>
        p.title.replace(/<[^>]*>/g, "").includes(name.replace(/\s+/g, "")) ||
        name.includes(p.title.replace(/<[^>]*>/g, ""))
      );
      if (match) {
        // 카테고리 업데이트
        await this.prisma.competitor.update({
          where: { id: competitorId },
          data: { category: match.category || undefined },
        });
      }
    } catch (e: any) {
      this.logger.warn(`장소 검색 실패 [${name}]: ${e.message}`);
    }

    // 3. 검색광고 API로 일 검색량
    try {
      const stats = await this.searchad.getKeywordStats([name.replace(/\s+/g, "")]);
      if (stats.length > 0) {
        searchVolume = Math.round(this.searchad.getTotalMonthlySearch(stats[0]) / 30);
      }
    } catch {}

    await this.prisma.competitor.update({
      where: { id: competitorId },
      data: {
        blogReviewCount: blogReviewCount || undefined,
        dailySearchVolume: searchVolume || undefined,
        lastComparedAt: new Date(),
      },
    });

    this.logger.log(`경쟁매장 데이터 수집 완료: ${name} (검색량:${searchVolume}/일)`);
  }
}
