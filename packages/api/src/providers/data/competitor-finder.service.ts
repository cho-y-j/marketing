import { Injectable, Logger } from "@nestjs/common";
import { NaverSearchProvider } from "../naver/naver-search.provider";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class CompetitorFinderService {
  private readonly logger = new Logger(CompetitorFinderService.name);

  constructor(
    private naverSearch: NaverSearchProvider,
    private naverSearchad: NaverSearchadProvider,
    private prisma: PrismaService,
  ) {}

  // 동일 상권 + 동일 업종 상위 매장 자동 탐색
  async findCompetitors(storeId: string, count = 5) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) return [];

    // 매장의 카테고리 + 지역으로 네이버 검색
    const query = `${store.district || ""} ${store.subCategory || store.category || ""}`.trim();
    if (!query) {
      this.logger.warn(`검색 쿼리 생성 불가: ${store.name}`);
      return [];
    }

    this.logger.log(`경쟁 매장 탐색: "${query}"`);

    const places = await this.naverSearch.searchPlace(query, count + 3);

    // 자기 자신 제외 — 4가지 시그널 중 하나라도 일치하면 제외:
    //  1) link 에 store.naverPlaceId 포함
    //  2) 도로명 주소 일치
    //  3) 매장명 토큰 50% 이상 겹침
    //  4) 양방향 부분 일치
    const myTokens = this.tokenize(store.name);
    const myAddr = this.normalizeAddr(store.address || "");
    const myPlaceId = store.naverPlaceId || "";

    const competitors = places.filter((p) => {
      const cleanName = p.title.replace(/<[^>]*>/g, "");
      const cleanAddr = this.normalizeAddr(p.roadAddress || p.address || "");

      // 1) placeId 매칭
      if (myPlaceId && p.link && p.link.includes(myPlaceId)) return false;

      // 2) 주소 일치
      if (myAddr && cleanAddr && myAddr === cleanAddr) return false;

      // 3) 토큰 매칭
      const candTokens = this.tokenize(cleanName);
      const inter = [...myTokens].filter((t) => candTokens.has(t));
      const minSize = Math.min(myTokens.size, candTokens.size);
      if (minSize > 0 && inter.length / minSize >= 0.5) return false;

      // 4) 부분 일치 (이전 로직)
      if (cleanName.includes(store.name) || store.name.includes(cleanName)) return false;

      return true;
    });

    // 각 경쟁 매장 데이터 수집 및 저장
    const results = [];
    for (const place of competitors.slice(0, count)) {
      const name = place.title.replace(/<[^>]*>/g, "");

      // 키워드 검색량 수집
      let searchVolume = 0;
      try {
        const stats = await this.naverSearchad.getKeywordStats([name]);
        if (stats.length > 0) {
          searchVolume = this.naverSearchad.getTotalMonthlySearch(stats[0]);
        }
      } catch {
        // 검색광고 API 실패 시 무시
      }

      // 블로그 리뷰 수
      const blogs = await this.naverSearch.searchBlog(name, 1);

      const competitor = await this.prisma.competitor.create({
        data: {
          storeId,
          competitorName: name,
          category: place.category,
          type: "AUTO",
          dailySearchVolume: Math.round(searchVolume / 30),
          blogReviewCount: blogs.length,
          lastComparedAt: new Date(),
        },
      });

      results.push(competitor);
    }

    this.logger.log(`경쟁 매장 ${results.length}개 등록 완료`);
    return results;
  }

  /** 매장명 토큰화 (2-gram + 단어) */
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

  /** 주소 정규화 — 비교용 (공백/특수문자 제거) */
  private normalizeAddr(addr: string): string {
    return addr
      .replace(/\s+/g, "")
      .replace(/[(),]/g, "")
      .toLowerCase();
  }
}
