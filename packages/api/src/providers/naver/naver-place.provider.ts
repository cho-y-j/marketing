import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";

export interface PlaceInfo {
  id: string;
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  phone: string;
  businessHours: string;
  imageUrl?: string;
  reviewCount?: number;
  visitorReviewCount?: number;
  blogReviewCount?: number;
  saveCount?: number;
}

export interface ReviewData {
  reviews: Array<{
    content: string;
    date: string;
    rating?: number;
    isReceipt: boolean;
  }>;
  totalCount: number;
}

@Injectable()
export class NaverPlaceProvider {
  private readonly logger = new Logger(NaverPlaceProvider.name);

  // URL에서 플레이스 ID 추출
  extractPlaceIdFromUrl(url: string): string | null {
    const patterns = [
      /place\/(\d+)/,
      /restaurant\/(\d+)/,
      /cafe\/(\d+)/,
      /entry\/place\/(\d+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // 플레이스 기본 정보 조회 (공개 API)
  async getPlaceInfo(placeId: string): Promise<PlaceInfo | null> {
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/search/allSearch`,
        {
          params: { query: placeId, type: "all" },
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Referer: "https://map.naver.com/",
          },
          timeout: 10000,
        },
      );

      // 공개 API 응답 파싱 (구조는 변경될 수 있음)
      const place = resp.data?.result?.place?.list?.[0];
      if (!place) return null;

      return {
        id: place.id || placeId,
        name: place.name || "",
        category: place.category?.join(" > ") || "",
        address: place.address || "",
        roadAddress: place.roadAddress || "",
        phone: place.phone || "",
        businessHours: place.businessHours?.status || "",
        imageUrl: place.thumUrl || undefined,
        reviewCount: place.reviewCount || 0,
        visitorReviewCount: place.visitorReviewCount || 0,
        blogReviewCount: place.blogReviewCount || 0,
        saveCount: place.saveCount || 0,
      };
    } catch (e: any) {
      this.logger.warn(`플레이스 정보 조회 실패: ${e.message}`);
      return null;
    }
  }

  // 플레이스 리뷰 데이터 수집
  async getPlaceReviews(
    placeId: string,
    page = 1,
  ): Promise<ReviewData> {
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/boards/${placeId}/reviews`,
        {
          params: { page, size: 20 },
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Referer: "https://map.naver.com/",
          },
          timeout: 10000,
        },
      );

      const items = resp.data?.items || [];
      return {
        reviews: items.map((r: any) => ({
          content: r.body || "",
          date: r.created || "",
          rating: r.rating || undefined,
          isReceipt: r.isReceipt || false,
        })),
        totalCount: resp.data?.totalCount || 0,
      };
    } catch (e: any) {
      this.logger.warn(`리뷰 조회 실패: ${e.message}`);
      return { reviews: [], totalCount: 0 };
    }
  }
}
