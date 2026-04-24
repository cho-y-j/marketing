import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NaverSearchProvider } from "./naver-search.provider";
import { NaverPlaceProvider } from "./naver-place.provider";

export interface RankCheckResult {
  keyword: string;
  rank: number | null;
  totalResults: number;
  /**
   * 2026-04-24 추가 — 수집 신뢰도 플래그.
   * false 인 경우:
   *  - HTML scrape 실패 + 재시도 실패 (네이버 블락/rate limit)
   *  - totalResults < MIN_RELIABLE_RESULTS (응답 비정상 의심)
   * service layer 는 reliable=false 인 결과로 currentRank 를 덮어쓰지 않아야 함.
   */
  reliable: boolean;
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
   * 순위 체크 — search.naver.com HTML 페이지네이션(최대 Top 300) + Place API 병렬 보강.
   *
   * 2026-04-24 재설계 (Phase 10-B):
   *  - 네이버 공식 local.json API 는 display 하드 리밋 5 → 폴백으로 쓰면 rank=null 오염
   *  - HTML scrape 실패 시 local.json 으로 떨어지지 않음 (currentRank 덮어쓰기 금지)
   *  - Top 300 까지 페이지네이션 (start=1,11,21,...,291)
   *  - 21~300위는 이름/placeId 만 수집 (상세 API 호출은 Top 20 만 — 비용 절감)
   *  - 내 매장 찾으면 Stage 2 조기 종료
   *  - reliable=false 로 호출자에게 신뢰도 시그널 전달
   */
  private static readonly MIN_RELIABLE_RESULTS = 10; // 이보다 적으면 "수집 비정상" 판정
  private static readonly MAX_RANK = 300;            // Top 300 까지 추적
  private static readonly DETAIL_TOP_N = 20;         // 상위 N 개만 Place API 상세 호출

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
    const normalizedStore = storeName.replace(/\s+/g, "");
    const isSelf = (p: { id: string | null; name: string }): boolean => {
      if (naverPlaceId && p.id && p.id === naverPlaceId) return true;
      if (!naverPlaceId && p.name.replace(/\s+/g, "") === normalizedStore) return true;
      return false;
    };

    // ========== Stage 1: 1차 수집 + 재시도 비교 (일관성 판정) ==========
    //
    // 신뢰도 판정 로직 (2026-04-24):
    //   1차 결과 >= MIN_RELIABLE_RESULTS      → reliable (재시도 불필요)
    //   1차 결과 <  MIN_RELIABLE_RESULTS      → 재시도 1회
    //     재시도 결과 >= MIN_RELIABLE_RESULTS → reliable (1차 실패, 2차 성공)
    //     재시도 == 1차                       → reliable (자연적 희귀 키워드, 실제 상한)
    //     재시도 != 1차                       → unreliable (일시적 네이버 불안정)
    //     재시도 0                            → unreliable (완전 실패)
    //
    // 이로써 "공덕 아구찜" 처럼 실제로 매장 6개만 존재하는 키워드도 정상 저장되면서,
    // "05:00 cron 이 갑자기 5개만 받은" 일시적 불안정은 여전히 걸러짐.
    const firstPlaces = await this.fetchPlacesFromSearchHtml(keyword, 1);
    let firstPagePlaces = firstPlaces;
    let reliable = true;

    if (firstPlaces.length < NaverRankCheckerProvider.MIN_RELIABLE_RESULTS) {
      this.logger.warn(
        `[rank] "${keyword}" 1차 수집 ${firstPlaces.length}개 — 1.5초 후 재시도로 일관성 검증`,
      );
      await new Promise((r) => setTimeout(r, 1500));
      const retryPlaces = await this.fetchPlacesFromSearchHtml(keyword, 1);

      if (retryPlaces.length === 0) {
        // 재시도 완전 실패 — 일시적 네트워크/블락
        this.logger.warn(`[rank] "${keyword}" 재시도 실패 (0개) — skip`);
        return {
          keyword, rank: null, totalResults: firstPlaces.length,
          reliable: false, topPlaces: [], checkedAt: new Date(),
        };
      }

      // 일관성 판정: 두 번 같은 결과 수면 자연적 한계, 다르면 불안정
      if (retryPlaces.length === firstPlaces.length) {
        this.logger.log(
          `[rank] "${keyword}" 자연적 한계 (1차=${firstPlaces.length}, 재시도=${retryPlaces.length}) — reliable`,
        );
        reliable = true;
      } else if (retryPlaces.length >= NaverRankCheckerProvider.MIN_RELIABLE_RESULTS) {
        // 재시도가 충분한 결과 — 1차는 일시적 불안정이었음, 재시도 결과 채택
        this.logger.log(
          `[rank] "${keyword}" 재시도 성공 (${firstPlaces.length} → ${retryPlaces.length}) — reliable`,
        );
        firstPagePlaces = retryPlaces;
        reliable = true;
      } else {
        // 두 결과가 다르고 둘 다 임계 미만 — 불안정
        this.logger.warn(
          `[rank] "${keyword}" 불안정 (1차=${firstPlaces.length}, 재시도=${retryPlaces.length}) — skip`,
        );
        return {
          keyword, rank: null, totalResults: firstPlaces.length,
          reliable: false, topPlaces: [], checkedAt: new Date(),
        };
      }
    }

    // ========== Stage 2: Top 300 까지 페이지네이션 (내 매장 찾으면 조기 종료) ==========
    let rank: number | null = null;
    const allPlaces: Array<{ id: string | null; name: string }> = [];
    const seenNames = new Set<string>();
    const pushUnique = (place: { id: string | null; name: string }) => {
      const key = place.name.replace(/\s+/g, "");
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allPlaces.push(place);
      }
    };

    for (const p of firstPagePlaces) pushUnique(p);
    // 내 매장 찾았는지 확인
    for (let i = 0; i < allPlaces.length; i++) {
      if (isSelf(allPlaces[i])) {
        rank = i + 1;
        break;
      }
    }

    // 첫 페이지에 없으면 다음 페이지들 탐색 — 2026-04-24 병렬 배치로 리팩터
    // 의뢰자 요구: Top 300 정밀도 유지 (광역 250위 = 로컬 30위 진단용). 시간만 단축.
    // 5페이지씩 묶어서 Promise.all 병렬 → 배치 내 내 매장 발견 시 해당 페이지까지만 rank 계산 후 종료.
    if (rank === null) {
      const PAGE_STEP = 10;
      const BATCH_SIZE = 5; // 5페이지씩 병렬 (≈50위 블록)
      const pagesToFetch: number[] = [];
      for (let start = 11; start <= NaverRankCheckerProvider.MAX_RANK; start += PAGE_STEP) {
        pagesToFetch.push(start);
      }
      for (let bi = 0; bi < pagesToFetch.length && rank === null; bi += BATCH_SIZE) {
        const batch = pagesToFetch.slice(bi, bi + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map((s) => this.fetchPlacesFromSearchHtml(keyword, s).then((places) => ({ start: s, places }))),
        );
        // start 오름차순으로 순서 보존 (병렬이어도 순위는 정렬 유지)
        batchResults.sort((a, b) => a.start - b.start);
        let emptyPageHit = false;
        for (const { places } of batchResults) {
          if (places.length === 0) { emptyPageHit = true; break; }
          const beforeCount = allPlaces.length;
          for (const p of places) pushUnique(p);
          for (let i = beforeCount; i < allPlaces.length; i++) {
            if (isSelf(allPlaces[i])) {
              rank = i + 1;
              break;
            }
          }
          if (rank !== null) break;
        }
        if (emptyPageHit) break; // 검색 결과 끝 — 더 이상 페이지 없음
        await new Promise((r) => setTimeout(r, 300)); // 배치 간 rate limit 예방
      }
    }

    // ========== Stage 3: Top 20 만 Place API 상세 호출 (성능 절감) ==========
    const topPlaces: RankCheckResult["topPlaces"] = [];
    const detailLimit = Math.min(allPlaces.length, NaverRankCheckerProvider.DETAIL_TOP_N);
    const BATCH_SIZE = 5;
    for (let batchStart = 0; batchStart < detailLimit; batchStart += BATCH_SIZE) {
      const batch = allPlaces.slice(batchStart, batchStart + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (p, j) => {
          const i = batchStart + j;
          let detail: any = null;
          try {
            if (p.id) detail = await this.naverPlace.getPlaceDetail(p.id);
            else detail = await this.naverPlace.searchAndGetPlaceInfo(p.name);
          } catch {}
          return {
            name: p.name,
            rank: i + 1,
            placeId: p.id || detail?.id || undefined,
            category: detail?.category || undefined,
            visitorReviewCount: detail?.visitorReviewCount || undefined,
            blogReviewCount: detail?.blogReviewCount || undefined,
            saveCount: detail?.saveCount || undefined,
            isMine: isSelf(p),
          };
        }),
      );
      topPlaces.push(...results);
    }

    this.logger.log(
      `순위 체크: "${keyword}" → ${storeName}: ${rank ? `${rank}위` : `${NaverRankCheckerProvider.MAX_RANK}위 밖`} (${allPlaces.length}개 수집, 상세 ${topPlaces.length})`,
    );

    return {
      keyword,
      rank,
      totalResults: allPlaces.length,
      reliable,
      topPlaces,
      checkedAt: new Date(),
    };
  }

  /**
   * search.naver.com HTML에서 placeId+name 쌍 추출 (Chrome 없이, 페이지네이션 지원).
   *
   * 2026-04-24 강화 (Phase 10-B):
   *  - 모바일 UA 고정 (사장님 실사용 환경 = 모바일 검색)
   *  - Accept-Language: ko-KR 강제
   *  - start 파라미터 지원 → 페이지네이션 (1, 11, 21, ...)
   *  - 지역 쿠키 느낌 (region=korean) — 비로그인에서 결과 안정화
   */
  private async fetchPlacesFromSearchHtml(
    keyword: string,
    start: number = 1,
  ): Promise<Array<{ id: string | null; name: string }>> {
    try {
      const axios = (await import("axios")).default;
      // 모바일 경로: m.search.naver.com (SSR, 매장 리스트 m_place 탭)
      // start 파라미터로 페이지네이션 (1=1~10위, 11=11~20위, ...)
      const url = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}&where=m_place&start=${start}`;
      const resp = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Referer": "https://m.naver.com/",
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"iOS"',
        },
        timeout: 15000,
      });
      const html: string = resp.data;
      return this.extractPlacesFromHtml(html);
    } catch (e: any) {
      this.logger.warn(`[rank] HTML scrape 실패 "${keyword}" start=${start}: ${e.message}`);
      return [];
    }
  }

  /**
   * HTML 에서 플레이스 검색 결과 매장 목록 추출.
   *
   * 2026-04-24 근본 재작성 — 이전 정규식 방식은 `"id":숫자,"name":"매장명"` 을 전체 HTML 에서
   * 무차별로 긁어서 **광고 섹션(RestaurantAdSummary) 까지 경쟁사로 저장하는 참사** 발생.
   * 네이버 `__APOLLO_STATE__` JSON 블록에 실제 검색 결과와 광고가 명확히 분리 저장돼 있으므로
   * 그 JSON 의 `ROOT_QUERY.restaurantList` items 순서 + `RestaurantListSummary` 참조로만 추출.
   *
   * 우선순위:
   *   1) __APOLLO_STATE__ JSON 파싱 → restaurantList items 순회 (정석)
   *   2) 실패 시 기존 정규식 방식 (legacy, 오염 위험 있음)
   */
  private extractPlacesFromHtml(html: string): Array<{ id: string | null; name: string }> {
    // === 1순위: __APOLLO_STATE__ JSON 파서 ===
    const apolloPlaces = this.extractPlacesFromApolloState(html);
    if (apolloPlaces.length > 0) return apolloPlaces;

    // === 2순위: 기존 정규식 (APOLLO_STATE 없을 때만, 오염 위험 있음) ===
    return this.extractPlacesFromLegacyRegex(html);
  }

  /**
   * __APOLLO_STATE__ JSON 에서 실제 검색 결과(RestaurantListSummary)만 추출.
   * RestaurantAdSummary (광고 섹션) 는 참조하지 않음 — 경쟁사 오염 방지.
   * ROOT_QUERY.restaurantList(...).items 순서 = 네이버 플레이스 검색 노출 순서 그대로.
   */
  private extractPlacesFromApolloState(
    html: string,
  ): Array<{ id: string | null; name: string }> {
    const marker = "naver.search.ext.nmb.salt.__APOLLO_STATE__ = ";
    const start = html.indexOf(marker);
    if (start === -1) return [];
    const jsonStart = start + marker.length;

    // { 부터 균형 맞는 } 까지 (문자열 내부 중괄호 무시)
    let depth = 0;
    let end = -1;
    let inStr = false;
    let escape = false;
    for (let i = jsonStart; i < html.length; i++) {
      const c = html[i];
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end === -1) return [];

    let state: any;
    try {
      state = JSON.parse(html.slice(jsonStart, end));
    } catch (e: any) {
      this.logger.warn(`[apollo] JSON 파싱 실패: ${e.message}`);
      return [];
    }

    const rootQuery = state.ROOT_QUERY;
    if (!rootQuery || typeof rootQuery !== "object") return [];

    // restaurantList(...) 키 찾기 — 쿼리 파라미터 포함된 긴 키
    const listKey = Object.keys(rootQuery).find((k) => k.startsWith("restaurantList("));
    if (!listKey) return [];
    const listNode = rootQuery[listKey];
    const items: Array<{ __ref?: string }> = listNode?.items || [];
    if (items.length === 0) return [];

    const places: Array<{ id: string | null; name: string }> = [];
    const seen = new Set<string>();
    for (const it of items) {
      if (!it || !it.__ref) continue;
      const entry = state[it.__ref];
      if (!entry) continue;
      // 광고(RestaurantAdSummary) 는 skip — 검색 결과 리스트에도 섞일 여지는 없지만 보수적으로
      if (entry.__typename === "RestaurantAdSummary") continue;
      const name = (entry.name || "").trim();
      const id = entry.id ? String(entry.id) : null;
      if (!name || name.length < 2 || name.length > 40) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      places.push({ id, name });
    }
    return places;
  }

  /**
   * 레거시 정규식 파서 — __APOLLO_STATE__ 가 없는 HTML 대응용 최후 폴백.
   * 광고 섹션까지 긁을 위험이 있어 1순위 경로 실패 시에만 사용.
   */
  private extractPlacesFromLegacyRegex(
    html: string,
  ): Array<{ id: string | null; name: string }> {
    const places: Array<{ id: string | null; name: string }> = [];
    const seen = new Set<string>();

    const excludeSet = new Set([
      "랭킹", "많이찾는", "요즘뜨는", "TV에나온", "저장많은", "리뷰많은",
      "인기 메뉴", "플레이스", "nexearch", "naver", "search", "place",
      "더보기", "지도", "목록", "영업중", "예약", "톡톡",
    ]);
    const excludePatterns = [
      /^naver/i, /^search/i, /^http/i, /^image/i, /^icon/i,
      /^[가-힣]{1}$/,
      /^\d+만원/, /만원\s*[~∼]/, /\d+원\s*이상/, /\d+원\s*이하/,
      /^\d+(m|km|분|시간)\s*(이내|이상|이하)?/i,
    ];
    const filterIdPattern = /^\d0000$/;

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

  /**
   * 키워드 검색 실제 네이버 플레이스 Top N 매장 반환 (경쟁사 수집용).
   * - `/search/local.json` (sort=comment, 단순 리뷰많은순) 은 실제 플레이스 랭킹과 달라서
   *   "신길 맛집"에 스타벅스/맥도날드가 위로 뜨는 참사 발생 → 이 메서드로 교체 필수
   * - 페이지네이션으로 Top count 까지 수집 (최대 50 권장)
   * - 반환 순서 = 네이버 플레이스 검색 노출 순서
   */
  async fetchTopPlaces(
    keyword: string,
    count: number = 20,
  ): Promise<Array<{ id: string | null; name: string; rank: number }>> {
    const places: Array<{ id: string | null; name: string; rank: number }> = [];
    const seen = new Set<string>();
    const PAGE_STEP = 10;
    for (let start = 1; places.length < count && start <= NaverRankCheckerProvider.MAX_RANK; start += PAGE_STEP) {
      const page = await this.fetchPlacesFromSearchHtml(keyword, start);
      if (page.length === 0) break;
      for (const p of page) {
        const key = p.name.replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);
        places.push({ ...p, rank: places.length + 1 });
        if (places.length >= count) break;
      }
      if (start > 1) await new Promise((r) => setTimeout(r, 300));
    }
    this.logger.log(`[fetchTopPlaces] "${keyword}" Top ${places.length}개 수집`);
    return places;
  }
}
