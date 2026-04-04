import { Injectable, Logger } from "@nestjs/common";
import { NaverSearchProvider } from "../naver/naver-search.provider";
import { NaverDatalabProvider } from "../naver/naver-datalab.provider";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { NaverPlaceProvider } from "../naver/naver-place.provider";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class DataCollectorService {
  private readonly logger = new Logger(DataCollectorService.name);

  constructor(
    private naverSearch: NaverSearchProvider,
    private naverDatalab: NaverDatalabProvider,
    private naverSearchad: NaverSearchadProvider,
    private naverPlace: NaverPlaceProvider,
    private prisma: PrismaService,
  ) {}

  // 매장 등록 시 초기 데이터 수집
  async collectInitialData(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) return null;

    this.logger.log(`초기 데이터 수집 시작: ${store.name}`);

    // 1. 플레이스 기본 정보 수집
    let placeInfo = null;
    if (store.naverPlaceId) {
      placeInfo = await this.naverPlace.getPlaceInfo(store.naverPlaceId);
      if (placeInfo) {
        await this.prisma.store.update({
          where: { id: storeId },
          data: {
            category: placeInfo.category || store.category,
            address: placeInfo.roadAddress || store.address,
            phone: placeInfo.phone || store.phone,
          },
        });
      }
    }

    // 2. 블로그 리뷰 수 수집
    const blogResults = await this.naverSearch.searchBlog(store.name, 1);
    const blogReviewCount = blogResults.length > 0 ? blogResults.length : 0;

    // 3. 키워드 검색량 수집
    const mainKeyword = `${store.district || ""} ${store.subCategory || store.category || store.name}`.trim();
    let monthlySearchVolume = 0;
    try {
      const stats = await this.naverSearchad.getKeywordStats([mainKeyword]);
      if (stats.length > 0) {
        monthlySearchVolume = this.naverSearchad.getTotalMonthlySearch(stats[0]);
      }
    } catch (e: any) {
      this.logger.warn(`키워드 검색량 수집 실패: ${e.message}`);
    }

    // 4. 메인 키워드 저장
    if (mainKeyword) {
      await this.prisma.storeKeyword.upsert({
        where: { storeId_keyword: { storeId, keyword: mainKeyword } },
        update: { monthlySearchVolume },
        create: {
          storeId,
          keyword: mainKeyword,
          type: "MAIN",
          monthlySearchVolume,
        },
      });
    }

    // 5. 초기 분석 결과 저장
    await this.prisma.storeAnalysis.create({
      data: {
        storeId,
        blogReviewCount,
        receiptReviewCount: placeInfo?.visitorReviewCount || 0,
        saveCount: placeInfo?.saveCount || 0,
        dailySearchVolume: Math.round(monthlySearchVolume / 30),
      },
    });

    this.logger.log(`초기 데이터 수집 완료: ${store.name}`);
    return { placeInfo, blogReviewCount, monthlySearchVolume };
  }

  // 일일 데이터 업데이트
  async collectDailyUpdate(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { keywords: { where: { type: "MAIN" }, take: 3 } },
    });
    if (!store) return null;

    this.logger.log(`일일 업데이트: ${store.name}`);

    // 1. 키워드 트렌드 업데이트
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDate = weekAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    for (const kw of store.keywords) {
      try {
        const stats = await this.naverSearchad.getKeywordStats([kw.keyword]);
        if (stats.length > 0) {
          const newVolume = this.naverSearchad.getTotalMonthlySearch(stats[0]);
          const prevVolume = kw.monthlySearchVolume || 0;
          const change = prevVolume > 0
            ? ((newVolume - prevVolume) / prevVolume) * 100
            : 0;

          await this.prisma.storeKeyword.update({
            where: { id: kw.id },
            data: {
              previousRank: kw.currentRank,
              monthlySearchVolume: newVolume,
              trendDirection:
                change > 5 ? "UP" : change < -5 ? "DOWN" : "STABLE",
              trendPercentage: Math.round(change * 10) / 10,
              lastCheckedAt: new Date(),
            },
          });
        }
      } catch (e: any) {
        this.logger.warn(`키워드 업데이트 실패 [${kw.keyword}]: ${e.message}`);
      }
    }

    // 2. 플레이스 리뷰 수 변동 체크
    if (store.naverPlaceId) {
      const placeInfo = await this.naverPlace.getPlaceInfo(store.naverPlaceId);
      if (placeInfo) {
        await this.prisma.storeAnalysis.create({
          data: {
            storeId,
            receiptReviewCount: placeInfo.visitorReviewCount || 0,
            blogReviewCount: placeInfo.blogReviewCount || 0,
            saveCount: placeInfo.saveCount || 0,
          },
        });
      }
    }

    return { updated: true };
  }
}
