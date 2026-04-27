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
   * 순위 체크 — pcmap.place.naver.com SSR APOLLO_STATE 단발 호출(Top 70 한계).
   *
   * 2026-04-27 근본 재설계 (실측 검증 후):
   *  이전 m.search.naver.com 경로는 SSR display=5 하드코딩 + start 파라미터 무효 +
   *  좌표 미전달 시 서울 default 라는 3중 결함으로 1주일간 모든 currentRank 가 NULL/오염.
   *
   *  - pcmap.place.naver.com/restaurant/list?query=K&x=X&y=Y&display=70 단일 호출
   *  - APOLLO_STATE 의 RestaurantListSummary 에 visitor/blog/save/category 모두 포함 →
   *    Place API 상세 추가호출 0회 (이전 Top 20 detail enrichment 제거)
   *  - 페이지네이션 무효(start/page 파라미터 SSR 에 안 먹힘)이므로 Top 70 가 단발 한계
   *  - 매장이 70 위 안에 없으면 rank=null + totalResults=실제 검색결과 수(API 의 total) 반환
   *  - 좌표 누락 시 서울 default 좌표로 답이 와서 결과 오염 → 좌표 없이 호출 시 reliable=false
   */
  private static readonly MAX_RANK = 70;             // pcmap SSR 한 페이지 한계
  private static readonly REQ_DISPLAY = 70;

  async checkPlaceRank(
    keyword: string,
    storeName: string,
    naverPlaceId?: string,
    mapx?: number | null,
    mapy?: number | null,
  ): Promise<RankCheckResult> {
    return this.checkRankViaPcmap(keyword, storeName, naverPlaceId, mapx, mapy);
  }

  private async checkRankViaPcmap(
    keyword: string,
    storeName: string,
    naverPlaceId?: string,
    mapx?: number | null,
    mapy?: number | null,
  ): Promise<RankCheckResult> {
    const normalizedStore = storeName.replace(/\s+/g, "");
    const isSelf = (p: PcmapPlace): boolean => {
      if (naverPlaceId && p.id && p.id === naverPlaceId) return true;
      if (!naverPlaceId && p.name.replace(/\s+/g, "") === normalizedStore) return true;
      return false;
    };

    if (!mapx || !mapy) {
      // 좌표 없으면 서울 default 로 답이 와서 결과가 의미 없음 — 신뢰 불가로 마킹.
      // (메모리 P0 "매장 좌표 fix" 에 해당하는 케이스. 좌표 backfill 은 별도 작업.)
      this.logger.warn(`[rank] "${keyword}" 좌표 없음 (mapx/mapy 누락) — skip 으로 처리`);
      return {
        keyword, rank: null, totalResults: 0,
        reliable: false, topPlaces: [], checkedAt: new Date(),
      };
    }

    const { places, totalResults } = await this.fetchPlacesFromPcmap(keyword, mapx, mapy);
    if (places.length === 0) {
      this.logger.warn(`[rank] "${keyword}" pcmap 응답 비어있음 — unreliable`);
      return {
        keyword, rank: null, totalResults: 0,
        reliable: false, topPlaces: [], checkedAt: new Date(),
      };
    }

    let rank: number | null = null;
    const topPlaces: RankCheckResult["topPlaces"] = places.map((p, i) => {
      const mine = isSelf(p);
      if (mine && rank === null) rank = i + 1;
      return {
        name: p.name,
        rank: i + 1,
        placeId: p.id || undefined,
        category: p.category || undefined,
        visitorReviewCount: p.visitorReviewCount ?? undefined,
        blogReviewCount: p.blogReviewCount ?? undefined,
        saveCount: p.saveCount ?? undefined,
        isMine: mine,
      };
    });

    this.logger.log(
      `순위 체크: "${keyword}" → ${storeName}: ${rank ? `${rank}위` : `${NaverRankCheckerProvider.MAX_RANK}위 밖`} (${places.length}개 수집, 전체 ${totalResults})`,
    );

    return {
      keyword,
      rank,
      totalResults,
      reliable: true,
      topPlaces,
      checkedAt: new Date(),
    };
  }

  // ===== 프로세스 전역 HTML scrape 쿨다운 =====
  // 같은 IP 로 매장 등록 시 rank check + competitor finder 두 흐름이 겹쳐 분당 수십 회 호출 → 차단.
  // 모든 fetchPlacesFromPcmap 호출을 직렬화 + 호출 간 최소 간격 + 403/429 후 글로벌 쿨다운.
  private fetchChain: Promise<unknown> = Promise.resolve();
  private static readonly MIN_FETCH_INTERVAL_MS = 700;
  private cooldownUntil = 0;
  private static readonly COOLDOWN_AFTER_403_MS = 8000;

  // User-Agent rotation — 봇 탐지 회피
  private static readonly UA_POOL = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ];
  private pickUA() {
    const pool = NaverRankCheckerProvider.UA_POOL;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  private async serializedFetch<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.fetchChain.then(async () => {
      const now = Date.now();
      if (this.cooldownUntil > now) {
        const remain = this.cooldownUntil - now;
        this.logger.warn(`[rank] 글로벌 쿨다운 ${remain}ms 대기 (직전 403)`);
        await new Promise((r) => setTimeout(r, remain));
      }
      const data = await fn();
      await new Promise((r) => setTimeout(r, NaverRankCheckerProvider.MIN_FETCH_INTERVAL_MS));
      return data;
    });
    this.fetchChain = next.catch(() => {});
    return next as Promise<T>;
  }

  /**
   * pcmap.place.naver.com/restaurant/list SSR 호출.
   * 한 번에 display=70 + 좌표 기반 결과 + visitor/blog/save/category 풍부 필드 반환.
   * 403/429 시 1회 재시도 + 글로벌 쿨다운.
   */
  private async fetchPlacesFromPcmap(
    keyword: string,
    mapx: number,
    mapy: number,
    retry: boolean = true,
  ): Promise<{ places: PcmapPlace[]; totalResults: number }> {
    return this.serializedFetch(() => this.doFetchPlacesFromPcmap(keyword, mapx, mapy, retry));
  }

  private async doFetchPlacesFromPcmap(
    keyword: string,
    mapx: number,
    mapy: number,
    retry: boolean,
  ): Promise<{ places: PcmapPlace[]; totalResults: number }> {
    try {
      const axios = (await import("axios")).default;
      const url = `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(keyword)}&x=${mapx}&y=${mapy}&display=${NaverRankCheckerProvider.REQ_DISPLAY}`;
      const resp = await axios.get(url, {
        headers: {
          "User-Agent": this.pickUA(),
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Referer": "https://map.naver.com/",
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
        },
        timeout: 15000,
      });
      return this.extractPcmapApolloState(resp.data);
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 403 || status === 429) {
        this.cooldownUntil = Date.now() + NaverRankCheckerProvider.COOLDOWN_AFTER_403_MS;
        if (retry) {
          await new Promise((r) => setTimeout(r, 3000));
          return this.fetchPlacesFromPcmap(keyword, mapx, mapy, false);
        }
      }
      this.logger.warn(`[rank] pcmap fetch 실패 "${keyword}" (x=${mapx},y=${mapy}): ${e.message}`);
      return { places: [], totalResults: 0 };
    }
  }

  /**
   * pcmap HTML 의 __APOLLO_STATE__ 에서 RestaurantListSummary items 추출.
   * - ROOT_QUERY 의 restaurantList(...) 키 중 display 가 가장 큰 것을 채택 (display=9 보조 캐시 무시)
   * - items 순서 = 검색 노출 순서
   * - RestaurantAdSummary 광고는 건너뜀 (보수적)
   * - visitor/blog/save 모두 string 으로 들어와 parseInt 필요
   */
  private extractPcmapApolloState(
    html: string,
  ): { places: PcmapPlace[]; totalResults: number } {
    const marker = "__APOLLO_STATE__ = ";
    const start = html.indexOf(marker);
    if (start === -1) return { places: [], totalResults: 0 };
    const jsonStart = start + marker.length;

    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = jsonStart; i < html.length; i++) {
      const c = html[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end === -1) return { places: [], totalResults: 0 };

    let state: any;
    try {
      state = JSON.parse(html.slice(jsonStart, end));
    } catch (e: any) {
      this.logger.warn(`[pcmap] APOLLO JSON 파싱 실패: ${e.message}`);
      return { places: [], totalResults: 0 };
    }

    const rootQuery = state.ROOT_QUERY;
    if (!rootQuery || typeof rootQuery !== "object") return { places: [], totalResults: 0 };

    // pcmap 은 보통 display=70 (메인) + display=9 (필터 등) 두 개의 restaurantList 키가 있음.
    // display 가 가장 큰 키를 선택.
    let bestKey: string | undefined;
    let bestDisplay = 0;
    for (const k of Object.keys(rootQuery)) {
      if (!k.startsWith("restaurantList(")) continue;
      const m = k.match(/"display":(\d+)/);
      const d = m ? parseInt(m[1], 10) : 0;
      if (d > bestDisplay) { bestDisplay = d; bestKey = k; }
    }
    if (!bestKey) return { places: [], totalResults: 0 };

    const listNode = rootQuery[bestKey];
    const items: Array<{ __ref?: string }> = listNode?.items || [];
    const totalResults: number =
      typeof listNode?.total === "number" ? listNode.total : items.length;

    const places: PcmapPlace[] = [];
    const seenIds = new Set<string>();
    for (const it of items) {
      if (!it?.__ref) continue;
      const entry = state[it.__ref];
      if (!entry) continue;
      if (entry.__typename === "RestaurantAdSummary") continue;
      const name = (entry.name || "").trim();
      const id = entry.id ? String(entry.id) : null;
      if (!name) continue;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      places.push({
        id,
        name,
        category: entry.category || null,
        visitorReviewCount: parseIntSafe(entry.visitorReviewCount),
        blogReviewCount: parseIntSafe(entry.blogCafeReviewCount),
        saveCount: parseIntSafe(entry.saveCount),
      });
    }
    return { places, totalResults };
  }

  async checkMultipleRanks(
    keywords: string[],
    storeName: string,
    naverPlaceId?: string,
    mapx?: number | null,
    mapy?: number | null,
  ): Promise<RankCheckResult[]> {
    const results: RankCheckResult[] = [];
    for (const keyword of keywords) {
      const result = await this.checkPlaceRank(keyword, storeName, naverPlaceId, mapx, mapy);
      results.push(result);
      await new Promise((r) => setTimeout(r, 500));
    }
    return results;
  }

  /**
   * 키워드 검색 실제 네이버 플레이스 Top N 매장 반환 (경쟁사 수집용).
   * pcmap SSR 한 번에 70개까지 — count > 70 이면 70 으로 cap.
   * 좌표가 없으면 [] (서울 default 결과 오염 방지).
   */
  async fetchTopPlaces(
    keyword: string,
    count: number = 20,
    mapx?: number | null,
    mapy?: number | null,
  ): Promise<Array<{ id: string | null; name: string; rank: number }>> {
    if (!mapx || !mapy) {
      this.logger.warn(`[fetchTopPlaces] "${keyword}" 좌표 없음 — 서울 default 오염 방지로 빈 결과 반환`);
      return [];
    }
    const { places } = await this.fetchPlacesFromPcmap(keyword, mapx, mapy);
    const limit = Math.min(places.length, count, NaverRankCheckerProvider.MAX_RANK);
    const result = places.slice(0, limit).map((p, i) => ({
      id: p.id,
      name: p.name,
      rank: i + 1,
    }));
    this.logger.log(`[fetchTopPlaces] "${keyword}" Top ${result.length}개 수집 (요청 ${count})`);
    return result;
  }
}

interface PcmapPlace {
  id: string | null;
  name: string;
  category: string | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: number | null;
}

function parseIntSafe(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // "1,234" / "300+" / "~100" 같이 들어올 수 있음 — 첫 숫자 그룹만
    const m = v.replace(/,/g, "").match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  return null;
}
