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
    author?: string;
    isReceipt: boolean;
  }>;
  totalCount: number;
}

@Injectable()
export class NaverPlaceProvider {
  private readonly logger = new Logger(NaverPlaceProvider.name);

  private readonly headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://map.naver.com/",
  };

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

  /**
   * placeId로 직접 매장 상세 정보 조회.
   * 네이버 맵 내부 API를 사용 — 리뷰 수, 저장 수, 카테고리 등 반환.
   * 실패 시 allSearch 폴백.
   */
  async getPlaceDetail(placeId: string): Promise<PlaceInfo | null> {
    // 1차: 직접 상세 API
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/place/summary/${placeId}`,
        { headers: this.headers, timeout: 10000 },
      );
      const d = resp.data;
      if (d && (d.name || d.id)) {
        return {
          id: d.id || placeId,
          name: d.name || "",
          category: Array.isArray(d.category) ? d.category.join(" > ") : (d.category || ""),
          address: d.address || d.jibunAddress || "",
          roadAddress: d.roadAddress || "",
          phone: d.phone || d.tel || "",
          businessHours: d.businessHours?.status || d.businessStatus || "",
          imageUrl: d.thumUrl || d.imageUrl || undefined,
          reviewCount: d.reviewCount ?? d.totalReviewCount ?? 0,
          visitorReviewCount: d.visitorReviewCount ?? d.receiptReviewCount ?? 0,
          blogReviewCount: d.blogReviewCount ?? 0,
          saveCount: d.saveCount ?? d.bookmarkCount ?? 0,
        };
      }
    } catch (e: any) {
      this.logger.debug(`summary API 실패 (${placeId}), allSearch 폴백: ${e.message}`);
    }

    // 2차: allSearch 폴백
    return this.getPlaceInfo(placeId);
  }

  // 플레이스 기본 정보 조회 (공개 allSearch API)
  async getPlaceInfo(placeId: string): Promise<PlaceInfo | null> {
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/search/allSearch`,
        {
          params: { query: placeId, type: "all" },
          headers: this.headers,
          timeout: 10000,
        },
      );

      const place = resp.data?.result?.place?.list?.[0];
      if (!place) return null;

      return {
        id: place.id || placeId,
        name: place.name || "",
        category: Array.isArray(place.category) ? place.category.join(" > ") : (place.category || ""),
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

  /**
   * 매장명으로 검색해서 PlaceInfo 반환 + placeId 자동 추출.
   * 경쟁사 등 placeId가 없는 경우 사용.
   */
  async searchAndGetPlaceInfo(storeName: string): Promise<PlaceInfo | null> {
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/search/allSearch`,
        {
          params: { query: storeName, type: "all" },
          headers: this.headers,
          timeout: 10000,
        },
      );

      const place = resp.data?.result?.place?.list?.[0];
      if (!place) return null;

      return {
        id: place.id || "",
        name: place.name || "",
        category: Array.isArray(place.category) ? place.category.join(" > ") : (place.category || ""),
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
      this.logger.warn(`매장 검색 실패 [${storeName}]: ${e.message}`);
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
          headers: this.headers,
          timeout: 10000,
        },
      );

      const items = resp.data?.items || resp.data?.reviews || [];
      return {
        reviews: items.map((r: any) => ({
          content: r.body || r.content || "",
          date: r.created || r.date || "",
          rating: r.rating || undefined,
          author: r.authorName || r.nickname || r.author || "익명",
          isReceipt: r.isReceipt ?? r.isVisitor ?? false,
        })),
        totalCount: resp.data?.totalCount || resp.data?.total || 0,
      };
    } catch (e: any) {
      this.logger.warn(`리뷰 조회 실패: ${e.message}`);
      return { reviews: [], totalCount: 0 };
    }
  }
}
