import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { chromium, Browser } from "playwright-core";
import { execFileSync } from "child_process";
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
  private readonly chromePath: string;

  constructor(
    private config: ConfigService,
    private naverSearch: NaverSearchProvider,
    private naverPlace: NaverPlaceProvider,
  ) {
    // Chrome 경로 탐지
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ];
    let found = "";
    for (const p of paths) {
      try {
        execFileSync("test", ["-f", p]);
        found = p;
        break;
      } catch {}
    }
    this.chromePath = found;
    if (found) {
      this.logger.log(`Chrome 경로: ${found}`);
    } else {
      this.logger.warn("Chrome을 찾을 수 없습니다. 순위 체크가 제한됩니다.");
    }
  }

  /**
   * 네이버 통합검색 HTML에서 플레이스 JSON 데이터를 파싱하여 순위 체크
   */
  async checkPlaceRank(
    keyword: string,
    storeName: string,
    naverPlaceId?: string,
  ): Promise<RankCheckResult> {
    let browser: Browser | null = null;

    try {
      if (!this.chromePath) {
        // Chrome 없으면 네이버 공식 검색 API로 폴백
        return this.checkRankViaSearchAPI(keyword, storeName, naverPlaceId);
      }

      browser = await chromium.launch({
        headless: true,
        executablePath: this.chromePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();

      const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}&where=nexearch`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      const html = await page.content();
      await browser.close();
      browser = null;

      this.logger.debug(`HTML 길이: ${html.length}`);

      // HTML 내 JSON에서 매장 (id + 이름) 추출
      const places = this.extractPlacesFromHtml(html);
      this.logger.debug(`추출된 매장: ${places.length}개 - ${places.slice(0, 3).map((p) => p.name).join(", ")}`);

      // 순위 찾기 — placeId 우선, 이름 토큰 매칭 폴백
      let rank: number | null = null;
      const topPlaces: Array<{ name: string; rank: number }> = [];
      const targetTokens = this.tokenize(storeName);

      for (let i = 0; i < places.length; i++) {
        const p = places[i];
        topPlaces.push({ name: p.name, rank: i + 1 });

        if (rank !== null) continue;

        // 1순위: placeId 정확 일치 (가장 신뢰성 높음)
        if (naverPlaceId && p.id && p.id === naverPlaceId) {
          rank = i + 1;
          continue;
        }

        // 2순위: 매장명 토큰 매칭 (양방향 부분 일치 또는 토큰 50% 이상 겹침)
        const candidateTokens = this.tokenize(p.name);
        const intersection = [...targetTokens].filter((t) => candidateTokens.has(t));
        const minSize = Math.min(targetTokens.size, candidateTokens.size);
        if (
          minSize > 0 &&
          intersection.length / minSize >= 0.5 &&
          intersection.length >= 1
        ) {
          rank = i + 1;
        }
      }

      this.logger.log(
        `순위 체크: "${keyword}" → ${storeName}: ${rank ? `${rank}위` : `${places.length > 0 ? places.length : 50}위 밖`} (${places.length}개 결과)`,
      );

      return {
        keyword,
        rank,
        totalResults: places.length,
        topPlaces: topPlaces.slice(0, 10),
        checkedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.warn(`순위 체크 실패 [${keyword}]: ${e.message}`);
      return { keyword, rank: null, totalResults: 0, topPlaces: [], checkedAt: new Date() };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Chrome 없을 때 폴백 — 네이버 공식 검색 API로 순위 확인
   * 상위 5개 제한이지만 Chrome 없이 동작
   */
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

      // Top 50까지 확장 (애드로그 수준)
      const limit = Math.min(officialPlaces.length, 50);

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

      // 2) Place API 병렬 호출 (배치 5개씩, 50개 매장 → 10번 배치)
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
        `순위 체크(API폴백): "${keyword}" → ${storeName}: ${rank ? `${rank}위` : "10위 밖"} (${topPlaces.length}개 매장 + 상세 수집)`,
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
      return this.extractPlacesFromHtml(html).slice(0, 50);
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
    ];

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
        !name.includes("\\")
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

  /** 매장명 토큰화 — 2-gram + 단어 단위. rank-check 매칭용 */
  private tokenize(text: string): Set<string> {
    if (!text) return new Set();
    const cleaned = text
      .toLowerCase()
      .replace(/[^\w가-힣\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = new Set<string>();
    for (const w of cleaned.split(" ").filter((t) => t.length >= 2)) {
      tokens.add(w);
      if (w.length >= 4) {
        for (let i = 0; i <= w.length - 2; i++) tokens.add(w.slice(i, i + 2));
      }
    }
    return tokens;
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
