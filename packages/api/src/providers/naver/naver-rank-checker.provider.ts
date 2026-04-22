import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NaverSearchProvider } from "./naver-search.provider";
import { NaverPlaceProvider } from "./naver-place.provider";

export interface RankCheckResult {
  keyword: string;
  rank: number | null;
  totalResults: number;
  topPlaces: Array<{
    name: string;
    rank: number;
    placeId?: string;
    category?: string;
    visitorReviewCount?: number;
    blogReviewCount?: number;
    saveCount?: number;
    isMine?: boolean;
  }>;
  checkedAt: Date;
}

@Injectable()
export class NaverRankCheckerProvider {
  private readonly logger = new Logger(NaverRankCheckerProvider.name);

  constructor(
    private config: ConfigService,
    private naverSearch: NaverSearchProvider,
    private naverPlace: NaverPlaceProvider,
  ) {}

  /**
   * 순위 체크 — search.naver.com HTML 스크래핑(axios) + Place API 병렬 보강.
   * Chrome/브라우저 불필요. 네이버는 매장 검색결과를 SSR 로 내려줘서 axios 로
   * 충분하며, 각 매장의 방문자/블로그 리뷰는 Place API 로 채워 풍부하게 반환.
   * Top 100 까지 확장 (이전 Chrome 경로의 top 10 + name-only 대비 훨씬 상세).
   */
  async checkPlaceRank(
    keyword: string,
    storeName: string,
    naverPlaceId?: string,
  ): Promise<RankCheckResult> {
    return this.checkRankViaSearchAPI(keyword, storeName, naverPlaceId);
  }

  private async checkRankViaSearchAPI(
    keyword: string,
    storeName: string,
    naverPlaceId?: string,
  ): Promise<RankCheckResult> {
    try {
      // 더 많은 결과를 위해 search.naver.com HTML도 활용 (id+name 추출)
      const naverPlaces = await this.fetchPlacesFromSearchHtml(keyword);
      // 폴백: 공식 검색 API
      const officialPlaces = naverPlaces.length > 0
        ? naverPlaces
        : (await this.naverSearch.searchPlace(keyword, 10)).map((p) => ({
            id: null as string | null,
            name: p.title.replace(/<[^>]*>/g, "").trim(),
          }));

      const normalizedStore = storeName.replace(/\s+/g, "");
      const topPlaces: RankCheckResult["topPlaces"] = [];
      let rank: number | null = null;

      // Top 100까지 확장 (애드로그 수준 + 초과)
      const limit = Math.min(officialPlaces.length, 100);

      // 1) isMine 매칭은 빠르게 (Place API 없이) — rank 빠르게 산출
      for (let i = 0; i < limit; i++) {
        const p = officialPlaces[i];
        let isMine = false;
        if (naverPlaceId && p.id && p.id === naverPlaceId) {
          isMine = true;
        } else if (!naverPlaceId) {
          isMine = p.name.replace(/\s+/g, "") === normalizedStore;
        }
        if (isMine && rank === null) rank = i + 1;
      }

      // 2) Place API 병렬 호출 (배치 5개씩, 100개 매장 → 20번 배치)
      const BATCH_SIZE = 5;
      for (let batchStart = 0; batchStart < limit; batchStart += BATCH_SIZE) {
        const batch = officialPlaces.slice(batchStart, batchStart + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (p, j) => {
            const i = batchStart + j;
            const cleanName = p.name;
            let detail: any = null;
            try {
              if (p.id) {
                detail = await this.naverPlace.getPlaceDetail(p.id);
              } else {
                detail = await this.naverPlace.searchAndGetPlaceInfo(cleanName);
              }
            } catch {}

            const isMine =
              (naverPlaceId && p.id && p.id === naverPlaceId) ||
              (!naverPlaceId && cleanName.replace(/\s+/g, "") === normalizedStore);

            return {
              name: cleanName,
              rank: i + 1,
              placeId: p.id || detail?.id || undefined,
              category: detail?.category || undefined,
              visitorReviewCount: detail?.visitorReviewCount || undefined,
              blogReviewCount: detail?.blogReviewCount || undefined,
              saveCount: detail?.saveCount || undefined,
              isMine: !!isMine,
            };
          }),
        );
        topPlaces.push(...results);
      }

      this.logger.log(
        `순위 체크(API폴백): "${keyword}" → ${storeName}: ${rank ? `${rank}위` : `${topPlaces.length}위 밖`} (${topPlaces.length}개 매장 + 상세 수집)`,
      );

      return {
        keyword,
        rank,
        totalResults: topPlaces.length,
        topPlaces,
        checkedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.warn(`검색API 순위 체크 실패 [${keyword}]: ${e.message}`);
      return { keyword, rank: null, totalResults: 0, topPlaces: [], checkedAt: new Date() };
    }
  }

  /**
   * search.naver.com HTML에서 placeId+name 쌍 추출 (Chrome 없이)
   */
  private async fetchPlacesFromSearchHtml(keyword: string): Promise<Array<{ id: string | null; name: string }>> {
    try {
      const axios = (await import("axios")).default;
      const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}&where=nexearch`;
      const resp = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
          Referer: "https://map.naver.com/",
        },
        timeout: 10000,
      });
      const html: string = resp.data;
      return this.extractPlacesFromHtml(html).slice(0, 100);
    } catch {
      return [];
    }
  }

  /**
   * HTML에서 플레이스 매장 목록 추출 — name + id 쌍.
   * 네이버 검색 결과에 "id":"숫자","name":"매장명" 또는 인접한 형태로 들어있음.
   * 순서를 유지하며 (검색 노출 순) 중복 제거.
   */
  private extractPlacesFromHtml(html: string): Array<{ id: string | null; name: string }> {
    const places: Array<{ id: string | null; name: string }> = [];
    const seen = new Set<string>();

    // 검색어, UI 요소, 일반 단어 필터
    const excludeSet = new Set([
      "랭킹", "많이찾는", "요즘뜨는", "TV에나온", "저장많은", "리뷰많은",
      "인기 메뉴", "플레이스", "nexearch", "naver", "search", "place",
      "더보기", "지도", "목록", "영업중", "예약", "톡톡",
    ]);
    const excludePatterns = [
      /^naver/i, /^search/i, /^http/i, /^image/i, /^icon/i,
      /^[가-힣]{1}$/,
      // 가격대/필터 라벨 — 네이버는 "1만원 ~ 2만원" 같은 가격필터를 placeId 10000/20000 등으로 섞어 내보냄
      /^\d+만원/, /만원\s*[~∼]/, /\d+원\s*이상/, /\d+원\s*이하/,
      // 거리/시간 필터
      /^\d+(m|km|분|시간)\s*(이내|이상|이하)?/i,
      // 카테고리 탭 ("한식", "카페" 등 단일 카테고리는 매장이 아닐 가능성 높음) — 매장은 보통 2음절 이상 고유명
    ];
    // placeId가 라운드 숫자(10000, 20000, 30000, ..., 100000) 필터인 경우 제외
    const filterIdPattern = /^\d0000$/;

    // 1) "id":"숫자".....,"name":"매장명" 패턴 — placeId 와 name 을 함께 추출
    //    네이버는 plain JSON 으로 내보내므로 같은 객체 안에 id + name 이 인접
    const pairPattern = /"id"\s*:\s*"?(\d{5,12})"?[^{}]{0,500}?"name"\s*:\s*"([^"]{2,50})"/g;
    let m: RegExpExecArray | null;
    while ((m = pairPattern.exec(html)) !== null) {
      const id = m[1];
      const name = m[2].trim();
      if (
        name.length >= 2 &&
        name.length <= 40 &&
        !seen.has(name) &&
        !excludeSet.has(name) &&
        !excludePatterns.some((p) => p.test(name)) &&
        !/^\d+$/.test(name) &&
        !name.includes("\\") &&
        !filterIdPattern.test(id)
      ) {
        seen.add(name);
        places.push({ id, name });
      }
    }

    // 2) 폴백: name 필드만 추출 (id 없음)
    if (places.length === 0) {
      const namePattern = /"name"\s*:\s*"([^"]{2,50})"/g;
      while ((m = namePattern.exec(html)) !== null) {
        const name = m[1].trim();
        if (
          name.length >= 2 &&
          name.length <= 40 &&
          !seen.has(name) &&
          !excludeSet.has(name) &&
          !excludePatterns.some((p) => p.test(name)) &&
          !/^\d+$/.test(name) &&
          !name.includes("\\")
        ) {
          seen.add(name);
          places.push({ id: null, name });
        }
      }
    }

    // 3) 마지막 폴백: place_bluelink 마크업
    if (places.length === 0) {
      const linkPattern = /place_bluelink[^>]*>([^<]+)/g;
      while ((m = linkPattern.exec(html)) !== null) {
        const name = m[1].trim();
        if (name.length >= 2 && !seen.has(name)) {
          seen.add(name);
          places.push({ id: null, name });
        }
      }
    }

    return places;
  }

  async checkMultipleRanks(
    keywords: string[],
    storeName: string,
    naverPlaceId?: string,
  ): Promise<RankCheckResult[]> {
    const results: RankCheckResult[] = [];
    for (const keyword of keywords) {
      const result = await this.checkPlaceRank(keyword, storeName, naverPlaceId);
      results.push(result);
      await new Promise((r) => setTimeout(r, 1000));
    }
    return results;
  }
}
