import { Injectable, Logger } from "@nestjs/common";
import { NaverSearchProvider } from "../naver/naver-search.provider";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class CompetitorFinderService {
  private readonly logger = new Logger(CompetitorFinderService.name);

  constructor(
    private naverSearch: NaverSearchProvider,
    private naverSearchad: NaverSearchadProvider,
    private prisma: PrismaService,
  ) {}

  // 동일 상권 + 동일 업종 상위 매장 자동 탐색
  async findCompetitors(storeId: string, count = 5) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) return [];

    // 매장의 카테고리 + 지역으로 네이버 검색
    const query = `${store.district || ""} ${store.subCategory || store.category || ""}`.trim();
    if (!query) {
      this.logger.warn(`검색 쿼리 생성 불가: ${store.name}`);
      return [];
    }

    this.logger.log(`경쟁 매장 탐색: "${query}"`);

    const places = await this.naverSearch.searchPlace(query, count + 1);

    // 자기 자신 제외
    const competitors = places.filter(
      (p) => !p.title.replace(/<[^>]*>/g, "").includes(store.name),
    );

    // 각 경쟁 매장 데이터 수집 및 저장
    const results = [];
    for (const place of competitors.slice(0, count)) {
      const name = place.title.replace(/<[^>]*>/g, "");

      // 키워드 검색량 수집
      let searchVolume = 0;
      try {
        const stats = await this.naverSearchad.getKeywordStats([name]);
        if (stats.length > 0) {
          searchVolume = this.naverSearchad.getTotalMonthlySearch(stats[0]);
        }
      } catch {
        // 검색광고 API 실패 시 무시
      }

      // 블로그 리뷰 수
      const blogs = await this.naverSearch.searchBlog(name, 1);

      const competitor = await this.prisma.competitor.create({
        data: {
          storeId,
          competitorName: name,
          category: place.category,
          type: "AUTO",
          dailySearchVolume: Math.round(searchVolume / 30),
          blogReviewCount: blogs.length,
          lastComparedAt: new Date(),
        },
      });

      results.push(competitor);
    }

    this.logger.log(`경쟁 매장 ${results.length}개 등록 완료`);
    return results;
  }
}
