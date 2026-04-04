import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { AIProvider } from "../ai/ai.provider";
import { chromium } from "playwright-core";
import { execFileSync } from "child_process";

@Injectable()
export class StoreSetupService {
  private readonly logger = new Logger(StoreSetupService.name);
  private readonly chromePath: string;

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private ai: AIProvider,
  ) {
    // Chrome 경로 탐지
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ];
    let found = "";
    for (const p of paths) {
      try { execFileSync("test", ["-f", p]); found = p; break; } catch {}
    }
    this.chromePath = found;
  }

  /**
   * 매장 등록 후 자동 셋업 전체 파이프라인
   * 1. 플레이스에서 실제 주소/카테고리 수집
   * 2. AI가 실제 주소 기반 키워드 자동 생성
   * 3. 같은 지역+업종 경쟁매장 자동 탐색
   * 4. 키워드 검색량 자동 조회
   */
  async autoSetup(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return;

    this.logger.log(`자동 셋업 시작: ${store.name}`);

    // 1단계: 플레이스에서 실제 정보 수집
    let placeInfo: any = null;
    if (store.naverPlaceId) {
      // 매장명 + 기존 주소/지역 정보를 조합해서 정확하게 검색
      const searchHint = [store.name, store.district, store.address].filter(Boolean).join(" ");
      placeInfo = await this.scrapePlace(searchHint, store.naverPlaceId);
      if (placeInfo) {
        await this.prisma.store.update({
          where: { id: storeId },
          data: {
            address: placeInfo.address || store.address,
            category: placeInfo.category || store.category,
            district: placeInfo.district || store.district,
            phone: placeInfo.phone || store.phone,
          },
        });
        this.logger.log(`매장 정보 업데이트: ${placeInfo.address}, ${placeInfo.category}`);
      }
    }

    // 실제 주소에서 지역 추출
    const address = placeInfo?.address || store.address || "";
    const category = placeInfo?.category || store.category || "";
    const district = this.extractDistrict(address) || store.district || "";

    // 2단계: AI가 실제 주소 기반 키워드 자동 생성
    const keywords = await this.generateSmartKeywords(store.name, address, category, district);
    this.logger.log(`AI 키워드 ${keywords.length}개 생성: ${keywords.join(", ")}`);

    for (const kw of keywords) {
      try {
        const created = await this.prisma.storeKeyword.create({
          data: { storeId, keyword: kw, type: "AI_RECOMMENDED" },
        });
        // 검색량 자동 조회
        await this.fetchVolume(created.id, kw);
      } catch (e: any) {
        // 중복 키워드 무시
        if (!e.message?.includes("Unique")) {
          this.logger.warn(`키워드 추가 실패 [${kw}]: ${e.message}`);
        }
      }
    }

    // 최신 매장 정보 다시 로드 (업데이트된 주소 반영)
    const updatedStore = await this.prisma.store.findUnique({ where: { id: storeId } });
    const finalDistrict = updatedStore?.district || district;
    const finalCategory = updatedStore?.category || category;

    // 3단계: 같은 지역+업종 경쟁매장 자동 탐색
    await this.findCompetitors(storeId, store.name, finalDistrict, finalCategory);

    this.logger.log(`자동 셋업 완료: ${store.name}`);
  }

  // 네이버 검색에서 매장 정보 스크래핑
  private async scrapePlace(storeName: string, placeId: string): Promise<any> {
    if (!this.chromePath) return null;

    try {
      const browser = await chromium.launch({
        headless: true,
        executablePath: this.chromePath,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();

      // 여러 검색어로 시도 — 가장 정확한 결과를 찾기 위해
      let html = "";
      const queries = [
        storeName, // "남해꼼장어 청주 가경동" 같은 힌트 포함 검색어
        `${storeName.split(" ")[0]} 플레이스 ${placeId}`, // 매장명 + 플레이스ID
      ];

      for (const query of queries) {
        await page.goto(
          `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`,
          { waitUntil: "networkidle", timeout: 15000 },
        );
        html = await page.content();
        // 주소가 발견되면 성공
        if (html.match(/"address":"[^"]+"/)) break;
      }
      await browser.close();

      // 주소 추출 (여러 패턴)
      const allAddrs = [...html.matchAll(/"(?:road)?[Aa]ddress":"([^"]+)"/g)].map((m) => m[1]);
      const addrMatch = html.match(/"address":"([^"]+)"/);
      const roadMatch = html.match(/"roadAddress":"([^"]+)"/);
      const catMatch = html.match(/"category(?:Name)?":"([^"]+)"/);
      const phoneMatch = html.match(/"phone":"([^"]+)"/);

      const address = roadMatch?.[1] || addrMatch?.[1] || "";
      return {
        address,
        category: catMatch?.[1] || "",
        district: this.extractDistrict(address),
        phone: phoneMatch?.[1] || "",
      };
    } catch (e: any) {
      this.logger.warn(`플레이스 스크래핑 실패: ${e.message}`);
      return null;
    }
  }

  // 주소에서 지역명 추출 (동 단위)
  private extractDistrict(address: string): string {
    if (!address) return "";
    const parts = address.split(" ");
    // "충북 청주시 흥덕구 가경동 1378" → "청주 가경동"
    // "서울 마포구 와우산로 123" → "홍대" (매핑 필요)
    const city = parts[1]?.replace(/시$/, "") || "";
    const dong = parts.find((p) => p.endsWith("동") || p.endsWith("읍") || p.endsWith("면")) || "";
    return `${city} ${dong}`.trim();
  }

  // AI가 실제 주소/카테고리 기반으로 키워드 생성
  private async generateSmartKeywords(
    storeName: string,
    address: string,
    category: string,
    district: string,
  ): Promise<string[]> {
    const prompt = `매장 정보:
- 매장명: ${storeName}
- 주소: ${address}
- 카테고리: ${category}
- 지역: ${district}

이 매장이 네이버에서 검색 노출되려면 어떤 키워드로 검색될 때 나와야 할까?
실제 고객이 검색할 법한 키워드 8~10개를 추천해줘.

규칙:
1. 실제 주소 기반 지역 키워드 (예: "청주 가경동 맛집", "청주 꼼장어")
2. 업종 키워드 (예: "꼼장어 맛집", "장어구이")
3. 상황 키워드 (예: "청주 회식", "가경동 저녁")
4. 절대 엉뚱한 지역 넣지 마 (주소가 청주면 홍대/강남 키워드 넣지 마)

JSON 배열로만 응답해:
["키워드1", "키워드2", ...]`;

    try {
      const response = await this.ai.analyze(
        "너는 네이버 플레이스 SEO 전문가다. 매장 정보를 보고 최적의 검색 키워드를 추천한다.",
        prompt,
      );

      const match = response.content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return parsed.filter((k: string) => typeof k === "string" && k.length >= 2);
      }
    } catch (e: any) {
      this.logger.warn(`AI 키워드 생성 실패: ${e.message}`);
    }

    // AI 실패 시 기본 키워드
    const fallback: string[] = [];
    if (district && category) fallback.push(`${district} ${category}`);
    if (district) fallback.push(`${district} 맛집`);
    if (storeName) fallback.push(storeName);
    return fallback;
  }

  // 같은 지역+업종 경쟁매장 자동 탐색
  private async findCompetitors(
    storeId: string,
    storeName: string,
    district: string,
    category: string,
  ) {
    if (!district || !this.chromePath) return;

    const query = `${district} ${category || "맛집"}`;
    this.logger.log(`경쟁매장 탐색: "${query}"`);

    try {
      const browser = await chromium.launch({
        headless: true,
        executablePath: this.chromePath,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();
      await page.goto(
        `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`,
        { waitUntil: "networkidle", timeout: 15000 },
      );
      const html = await page.content();
      await browser.close();

      // 매장명 추출
      const nameRe = /"name":"([^"]{2,30})"/g;
      const exclude = new Set([district, category, "맛집", query.replace(/\s/g, ""), storeName]);
      const places: string[] = [];
      let m;
      while ((m = nameRe.exec(html)) !== null) {
        const name = m[1];
        if (!exclude.has(name) && !name.startsWith("http") && !/^\d+$/.test(name) && places.length < 5) {
          if (!places.includes(name)) places.push(name);
        }
      }

      // 경쟁매장 저장
      for (const name of places) {
        try {
          await this.prisma.competitor.create({
            data: {
              storeId,
              competitorName: name,
              category: category || undefined,
              type: "AUTO",
            },
          });
        } catch {}
      }

      this.logger.log(`경쟁매장 ${places.length}개 등록: ${places.join(", ")}`);
    } catch (e: any) {
      this.logger.warn(`경쟁매장 탐색 실패: ${e.message}`);
    }
  }

  // 키워드 검색량 조회
  private async fetchVolume(keywordId: string, keyword: string) {
    try {
      const searchTerm = keyword.replace(/\s+/g, "");
      const stats = await this.searchad.getKeywordStats([searchTerm]);
      if (stats.length > 0) {
        const volume = this.searchad.getTotalMonthlySearch(stats[0]);
        await this.prisma.storeKeyword.update({
          where: { id: keywordId },
          data: { monthlySearchVolume: volume, lastCheckedAt: new Date() },
        });
      }
    } catch {}
  }
}
