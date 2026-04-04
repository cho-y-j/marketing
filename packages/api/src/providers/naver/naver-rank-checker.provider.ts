import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { chromium, Browser } from "playwright-core";
import { execFileSync } from "child_process";

export interface RankCheckResult {
  keyword: string;
  rank: number | null;
  totalResults: number;
  topPlaces: Array<{ name: string; rank: number }>;
  checkedAt: Date;
}

@Injectable()
export class NaverRankCheckerProvider {
  private readonly logger = new Logger(NaverRankCheckerProvider.name);
  private readonly chromePath: string;

  constructor(private config: ConfigService) {
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
        this.logger.warn("Chrome 없음 — 순위 체크 불가");
        return { keyword, rank: null, totalResults: 0, topPlaces: [], checkedAt: new Date() };
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

      // HTML 내 JSON에서 매장명 추출 (플레이스 섹션)
      const places = this.extractPlacesFromHtml(html);
      this.logger.debug(`추출된 매장: ${places.length}개 - ${places.slice(0, 3).join(", ")}`);

      // 순위 찾기
      let rank: number | null = null;
      const topPlaces: Array<{ name: string; rank: number }> = [];

      for (let i = 0; i < places.length; i++) {
        topPlaces.push({ name: places[i], rank: i + 1 });

        if (rank !== null) continue;

        const placeName = places[i].toLowerCase();
        const target = storeName.toLowerCase();
        if (placeName.includes(target) || target.includes(placeName)) {
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
   * HTML에서 플레이스 매장 목록 추출
   * 네이버 검색 결과 HTML에 내장된 JSON 데이터에서 "name" 필드를 파싱
   */
  private extractPlacesFromHtml(html: string): string[] {
    const places: string[] = [];

    // 전체 HTML에서 "name" 필드를 추출 (플레이스 JSON 데이터 포함)
    const searchArea = html;

    // JSON 내 "name" 필드 추출 (플레이스 영역)
    const namePattern = /"name"\s*:\s*"([^"]{2,50})"/g;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();

    // 검색어, UI 요소, 일반 단어 필터
    const excludeSet = new Set([
      "랭킹", "많이찾는", "요즘뜨는", "TV에나온", "저장많은", "리뷰많은",
      "인기 메뉴", "플레이스", "nexearch", "naver", "search", "place",
      "더보기", "지도", "목록", "영업중", "예약", "톡톡",
    ]);
    const excludePatterns = [
      /^naver/i, /^search/i, /^http/i, /^image/i, /^icon/i,
      /^[가-힣]{1}$/, // 한 글자
    ];

    while ((match = namePattern.exec(searchArea)) !== null) {
      const name = match[1].trim();
      if (
        name.length >= 2 &&
        name.length <= 40 &&
        !seen.has(name) &&
        !excludeSet.has(name) &&
        !excludePatterns.some((p) => p.test(name)) &&
        !/^\d+$/.test(name) &&
        !name.includes("\\") &&
        !name.startsWith("http")
      ) {
        seen.add(name);
        places.push(name);
      }
    }

    // 방법 2: 플레이스 리스트 마크업에서 추출 (폴백)
    if (places.length === 0) {
      const linkPattern = /place_bluelink[^>]*>([^<]+)/g;
      while ((match = linkPattern.exec(html)) !== null) {
        const name = match[1].trim();
        if (name.length >= 2 && !seen.has(name)) {
          seen.add(name);
          places.push(name);
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
