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
    // 1차: 직접 상세 API (신규 구조: data.placeDetail)
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/place/summary/${placeId}`,
        { headers: this.headers, timeout: 10000 },
      );
      // 신규 응답: { data: { placeDetail: { ... } } }
      const d = resp.data?.data?.placeDetail || resp.data;
      if (d && (d.name || d.id)) {
        const visitorText: string = d.visitorReviews?.displayText || "";
        const visitorCount = this.parseReviewCount(visitorText);
        return {
          id: d.id || placeId,
          name: d.name || "",
          category: d.category?.category || (Array.isArray(d.category) ? d.category.join(" > ") : (d.category || "")),
          address: d.address?.address || d.address?.formattedAddress || d.jibunAddress || "",
          roadAddress: d.address?.roadAddress || d.roadAddress || "",
          phone: d.phone?.number || d.phone || d.tel || "",
          businessHours: d.businessHours?.description || d.businessHours?.status || d.businessStatus || "",
          imageUrl: d.images?.images?.[0]?.origin || d.thumUrl || d.imageUrl || undefined,
          reviewCount: (d.reviewCount ?? d.totalReviewCount ?? visitorCount) || 0,
          visitorReviewCount: visitorCount || d.visitorReviewCount || 0,
          blogReviewCount: d.blogReviews?.total ?? d.blogReviewCount ?? 0,
          saveCount: d.saveCount ?? d.bookmarkCount ?? 0,
        };
      }
    } catch (e: any) {
      this.logger.debug(`summary API 실패 (${placeId}): ${e.message}`);
    }

    // 2차: allSearch 폴백 (매장 검색)
    return this.getPlaceInfo(placeId);
  }

  // "방문자 리뷰 1,563" → 1563
  private parseReviewCount(text: string): number {
    if (!text) return 0;
    const match = text.match(/([\d,]+)/);
    if (!match) return 0;
    return parseInt(match[1].replace(/,/g, ""), 10) || 0;
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
    // 1차: search.naver.com HTML에서 placeId 추출 → getPlaceDetail 호출
    try {
      const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(storeName)}&where=nexearch`;
      const resp = await axios.get(url, {
        headers: this.headers,
        timeout: 10000,
      });
      const html: string = resp.data;
      // JSON 패턴에서 id + name 쌍 추출 (가장 가까운 쌍만)
      // 네이버 SSR 결과: "id":"숫자"..."name":"매장명" 또는 "name":"..."..."id":"..."
      const placeIds = Array.from(html.matchAll(/"id":"(\d+)"[^}]{0,500}?"name":"([^"]+)"/g));
      const normalizedTarget = storeName.replace(/\s+/g, "");
      for (const m of placeIds) {
        const pid = m[1];
        const pname = m[2];
        if (pname.replace(/\s+/g, "").includes(normalizedTarget) ||
            normalizedTarget.includes(pname.replace(/\s+/g, ""))) {
          const detail = await this.getPlaceDetail(pid);
          if (detail) return detail;
        }
      }
      // 매칭 실패 시 첫 번째 placeId 시도
      if (placeIds.length > 0) {
        const pid = placeIds[0][1];
        const detail = await this.getPlaceDetail(pid);
        if (detail) return detail;
      }
    } catch (e: any) {
      this.logger.debug(`search.naver.com 실패 [${storeName}]: ${e.message}`);
    }

    // 2차: allSearch (백업) — 신규 응답 구조 파싱
    try {
      const resp = await axios.get(
        `https://map.naver.com/p/api/search/allSearch`,
        {
          params: { query: storeName, type: "all", searchCoord: "126.9780;37.5665" },
          headers: this.headers,
          timeout: 10000,
        },
      );

      const list = resp.data?.result?.place?.list || resp.data?.data?.places;
      const place = Array.isArray(list) ? list[0] : null;
      if (!place) return null;

      // placeId가 있으면 getPlaceDetail로 상세 조회
      if (place.id) {
        const detail = await this.getPlaceDetail(place.id);
        if (detail) return detail;
      }

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

  // 플레이스 리뷰 데이터 수집 — 사용자 네이버 토큰 사용 가능
  async getPlaceReviews(
    placeId: string,
    page = 1,
    naverAccessToken?: string,
  ): Promise<ReviewData> {
    const headers: Record<string, string> = {
      ...this.headers,
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Referer: `https://m.place.naver.com/restaurant/${placeId}/review/visitor`,
    };

    // 사장님 토큰이 있으면 인증 요청 (IP 차단 회피)
    if (naverAccessToken) {
      headers["Authorization"] = `Bearer ${naverAccessToken}`;
    }

    // 여러 API 엔드포인트 시도 (네이버가 자주 변경)
    const endpoints = [
      {
        url: `https://api.place.naver.com/graphql`,
        method: "POST" as const,
        data: [{
          operationName: "getVisitorReviews",
          variables: {
            input: {
              businessId: placeId,
              businessType: "restaurant",
              page,
              size: 20,
              isPhotoUsed: false,
              includeContent: true,
              getUserStats: false,
              platform: "mobile",
            },
          },
          query: `query getVisitorReviews($input: VisitorReviewsInput) {
            visitorReviews(input: $input) {
              items { id body created authorNickname rating isReceipt }
              total
            }
          }`,
        }],
        parse: (data: any) => {
          const result = Array.isArray(data) ? data[0]?.data : data?.data;
          const vr = result?.visitorReviews;
          return {
            reviews: (vr?.items || []).map((r: any) => ({
              content: r.body || "",
              date: r.created || "",
              rating: r.rating || undefined,
              author: r.authorNickname || "익명",
              isReceipt: r.isReceipt ?? true,
            })),
            totalCount: vr?.total || 0,
          };
        },
      },
      {
        url: `https://m.place.naver.com/restaurant/${placeId}/review/visitor?reviewSort=recent`,
        method: "GET" as const,
        data: null,
        parse: (data: any) => {
          const html = typeof data === "string" ? data : "";
          // __APOLLO_STATE__에서 VisitorReview 추출
          const apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.*?});/s);
          if (!apolloMatch) return { reviews: [], totalCount: 0 };
          try {
            const apolloData = JSON.parse(apolloMatch[1]);
            const reviews: any[] = [];
            for (const [, v] of Object.entries(apolloData)) {
              const item = v as any;
              if (
                item &&
                typeof item === "object" &&
                item.__typename === "VisitorReview" &&
                item.body
              ) {
                reviews.push({
                  content: item.body || "",
                  date: item.created || "",
                  rating: item.rating || undefined,
                  author:
                    (typeof item.author === "object"
                      ? item.author?.nickname
                      : undefined) || "방문자",
                  isReceipt: true,
                });
              }
            }
            return { reviews: reviews.slice(0, 20), totalCount: reviews.length };
          } catch {
            return { reviews: [], totalCount: 0 };
          }
        },
      },
      {
        url: `https://map.naver.com/p/api/boards/${placeId}/reviews`,
        method: "GET" as const,
        data: null,
        parse: (data: any) => {
          const items = data?.items || data?.reviews || [];
          return {
            reviews: items.map((r: any) => ({
              content: r.body || r.content || "",
              date: r.created || r.date || "",
              rating: r.rating || undefined,
              author: r.authorName || r.nickname || r.author || "익명",
              isReceipt: r.isReceipt ?? r.isVisitor ?? false,
            })),
            totalCount: data?.totalCount || data?.total || 0,
          };
        },
      },
    ];

    for (const ep of endpoints) {
      try {
        const requestHeaders = {
          ...headers,
          ...(ep.method === "POST" ? { "Content-Type": "application/json" } : {}),
        };

        const resp =
          ep.method === "POST"
            ? await axios.post(ep.url, ep.data, {
                headers: requestHeaders,
                timeout: 15000,
              })
            : await axios.get(ep.url, {
                params: ep.data === null ? { page, size: 20 } : undefined,
                headers: requestHeaders,
                timeout: 15000,
                // HTML 응답도 받을 수 있도록
                transformResponse: [(data: any) => data],
              });

        let responseData = resp.data;
        if (typeof responseData === "string" && responseData.startsWith("{")) {
          try {
            responseData = JSON.parse(responseData);
          } catch {}
        }

        const result = ep.parse(responseData);
        if (result.reviews.length > 0) {
          this.logger.log(
            `리뷰 ${result.reviews.length}건 수집 성공 (${ep.url.split("/")[2]})`,
          );
          return result;
        }
      } catch (e: any) {
        this.logger.debug(`리뷰 엔드포인트 실패 [${ep.url.split("?")[0]}]: ${e.message}`);
        continue;
      }
    }

    this.logger.warn(`리뷰 수집 실패: 모든 엔드포인트 실패 (placeId=${placeId})`);
    return { reviews: [], totalCount: 0 };
  }
}
