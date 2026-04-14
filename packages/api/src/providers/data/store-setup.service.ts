import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { NaverSearchProvider } from "../naver/naver-search.provider";
import { NaverPlaceProvider } from "../naver/naver-place.provider";
import { AIProvider } from "../ai/ai.provider";
import { KeywordDiscoveryService } from "../../modules/keyword/keyword-discovery.service";
import { AnalysisService } from "../../modules/analysis/analysis.service";
import { BriefingService } from "../../modules/briefing/briefing.service";

@Injectable()
export class StoreSetupService {
  private readonly logger = new Logger(StoreSetupService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private naverSearch: NaverSearchProvider,
    private naverPlace: NaverPlaceProvider,
    private ai: AIProvider,
    @Inject(forwardRef(() => KeywordDiscoveryService))
    private keywordDiscovery: KeywordDiscoveryService,
    @Inject(forwardRef(() => AnalysisService))
    private analysisService: AnalysisService,
    @Inject(forwardRef(() => BriefingService))
    private briefingService: BriefingService,
  ) {}

  /**
   * 매장 등록 후 자동 셋업 전체 파이프라인 (상태 추적 포함)
   * 1. 플레이스에서 실제 주소/카테고리 수집
   * 2. AI가 실제 주소 기반 키워드 자동 생성
   * 3. 같은 지역+업종 경쟁매장 자동 탐색
   * 4. 키워드 검색량 자동 조회
   * 5. 첫 분석 자동 실행
   *
   * 각 단계마다 setupStep 을 DB에 기록 → 프론트에서 진행률 표시 가능.
   * 실패 시 setupStatus=FAILED + setupError 기록 → 재시도 버튼 지원.
   */
  async autoSetup(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return;

    // 셋업 시작 상태 기록
    await this.updateSetupStatus(storeId, "RUNNING", "매장 정보 수집 중...");

    try {
      // 1단계: 플레이스에서 실제 정보 수집
      await this.updateSetupStatus(storeId, "RUNNING", "네이버 매장 정보 수집 중...");
      let placeInfo: any = null;
      if (store.naverPlaceId) {
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

      const address = placeInfo?.address || store.address || "";
      const category = placeInfo?.category || store.category || "";
      const district = this.extractDistrict(address) || store.district || "";

      // 2단계: 룰 테이블 기반 키워드 생성 + AI 보완
      await this.updateSetupStatus(storeId, "RUNNING", "키워드를 생성하는 중...");
      const ruleKeywords = await this.generateKeywordsFromRules(category, district, address);
      const aiKeywords = await this.generateSmartKeywords(store.name, address, category, district);
      // 룰 키워드 우선, AI 키워드는 중복 제거 후 추가
      const ruleSet = new Set(ruleKeywords);
      const keywords = [...ruleKeywords, ...aiKeywords.filter(k => !ruleSet.has(k))];
      this.logger.log(`키워드 ${keywords.length}개 생성 (룰: ${ruleKeywords.length}, AI: ${aiKeywords.length}): ${keywords.join(", ")}`);

      let keywordCount = 0;
      for (const kw of keywords) {
        try {
          const isFromRule = ruleKeywords.includes(kw);
          const created = await this.prisma.storeKeyword.create({
            data: {
              storeId,
              keyword: kw,
              type: isFromRule ? "MAIN" : "AI_RECOMMENDED",
            },
          });
          await this.fetchVolume(created.id, kw);
          keywordCount++;
        } catch (e: any) {
          if (!e.message?.includes("Unique")) {
            this.logger.warn(`키워드 추가 실패 [${kw}]: ${e.message}`);
          }
        }
      }

      // 3단계: 경쟁매장 탐색
      await this.updateSetupStatus(storeId, "RUNNING", "경쟁 매장을 찾는 중...");
      const updatedStore = await this.prisma.store.findUnique({ where: { id: storeId } });
      const finalDistrict = updatedStore?.district || district;
      const finalCategory = updatedStore?.category || category;
      await this.findCompetitors(storeId, store.name, finalDistrict, finalCategory);

      const competitorCount = await this.prisma.competitor.count({ where: { storeId } });

      // 4단계: 히든 키워드 발굴 + 자동 등록
      await this.updateSetupStatus(storeId, "RUNNING", "히든 키워드를 발굴하는 중...");
      let hiddenCount = 0;
      try {
        const discovery = await this.keywordDiscovery.discoverKeywords(storeId);
        for (const hidden of discovery.hidden) {
          try {
            await this.prisma.storeKeyword.create({
              data: {
                storeId,
                keyword: hidden.keyword,
                type: "HIDDEN",
                monthlySearchVolume: hidden.monthlyVolume || null,
                lastCheckedAt: new Date(),
              },
            });
            hiddenCount++;
          } catch (e: any) {
            if (!e.message?.includes("Unique")) {
              this.logger.warn(`히든 키워드 추가 실패 [${hidden.keyword}]: ${e.message}`);
            }
          }
        }
        this.logger.log(`히든 키워드 ${hiddenCount}개 등록`);
      } catch (e: any) {
        this.logger.warn(`히든 키워드 발굴 실패: ${e.message}`);
      }

      // 5단계: 첫 AI 분석 자동 실행
      await this.updateSetupStatus(storeId, "RUNNING", "AI가 매장을 분석하는 중...");
      let analysisScore: number | null = null;
      try {
        const analysis = await this.analysisService.analyzeStore(storeId);
        analysisScore = analysis.competitiveScore as number | null;
        this.logger.log(`첫 분석 완료: 경쟁력 ${analysisScore}점`);
      } catch (e: any) {
        this.logger.warn(`첫 분석 실패 (나중에 재시도 가능): ${e.message}`);
      }

      // 6단계: 첫 브리핑 생성
      await this.updateSetupStatus(storeId, "RUNNING", "오늘의 브리핑을 생성하는 중...");
      try {
        await this.briefingService.generateDailyBriefing(storeId);
        this.logger.log(`첫 브리핑 생성 완료`);
      } catch (e: any) {
        this.logger.warn(`첫 브리핑 생성 실패 (나중에 재시도 가능): ${e.message}`);
      }

      // 7단계: 셋업 완료
      const totalKeywords = keywordCount + hiddenCount;
      const scoreText = analysisScore ? `, 경쟁력 ${analysisScore}점` : "";
      await this.prisma.store.update({
        where: { id: storeId },
        data: {
          setupStatus: "COMPLETED",
          setupStep: `키워드 ${totalKeywords}개, 경쟁사 ${competitorCount}개${scoreText}`,
          setupError: null,
          setupCompletedAt: new Date(),
        },
      });
      this.logger.log(
        `자동 셋업 완료: ${store.name} (키워드 ${totalKeywords}개, 히든 ${hiddenCount}개, 경쟁사 ${competitorCount}개${scoreText})`,
      );

    } catch (e: any) {
      this.logger.error(`자동 셋업 실패 [${store.name}]: ${e.message}`);
      await this.prisma.store.update({
        where: { id: storeId },
        data: {
          setupStatus: "FAILED",
          setupStep: null,
          setupError: e.message?.slice(0, 500),
        },
      });
      throw e;
    }
  }

  // 셋업 상태 업데이트 헬퍼
  private async updateSetupStatus(storeId: string, status: string, step: string) {
    await this.prisma.store.update({
      where: { id: storeId },
      data: { setupStatus: status, setupStep: step },
    });
  }

  // 셋업 상태 조회 (프론트 폴링용)
  async getSetupStatus(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        setupStatus: true,
        setupStep: true,
        setupError: true,
        setupCompletedAt: true,
        _count: { select: { keywords: true, competitors: true } },
      },
    });
    if (!store) return null;
    return {
      status: store.setupStatus,
      step: store.setupStep,
      error: store.setupError,
      completedAt: store.setupCompletedAt,
      keywordCount: store._count.keywords,
      competitorCount: store._count.competitors,
    };
  }

  // 네이버 API로 매장 정보 조회 (Chrome 불필요)
  private async scrapePlace(storeName: string, placeId: string): Promise<any> {
    // 1차: placeId로 직접 조회
    try {
      const detail = await this.naverPlace.getPlaceDetail(placeId);
      if (detail && (detail.address || detail.roadAddress)) {
        const address = detail.roadAddress || detail.address;
        return {
          address,
          category: detail.category || "",
          district: this.extractDistrict(address),
          phone: detail.phone || "",
        };
      }
    } catch (e: any) {
      this.logger.debug(`placeId 직접 조회 실패 (${placeId}): ${e.message}`);
    }

    // 2차: 매장명으로 검색 API
    try {
      const places = await this.naverSearch.searchPlace(storeName, 3);
      if (places.length > 0) {
        const best = places[0];
        const address = best.roadAddress || best.address || "";
        return {
          address,
          category: best.category || "",
          district: this.extractDistrict(address),
          phone: best.telephone || "",
        };
      }
    } catch (e: any) {
      this.logger.warn(`검색 API 매장 정보 실패: ${e.message}`);
    }

    // 3차: 맵 API 검색 폴백
    try {
      const info = await this.naverPlace.searchAndGetPlaceInfo(storeName);
      if (info) {
        const address = info.roadAddress || info.address;
        return {
          address,
          category: info.category || "",
          district: this.extractDistrict(address),
          phone: info.phone || "",
        };
      }
    } catch (e: any) {
      this.logger.warn(`맵 API 매장 검색 실패: ${e.message}`);
    }

    return null;
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

  // 업종별 룰 테이블 기반 키워드 생성
  private async generateKeywordsFromRules(
    category: string,
    district: string,
    address: string,
  ): Promise<string[]> {
    if (!category) return [];

    // 카테고리에서 업종 매핑 (예: "음식점 > 한식 > 소고기" → 소고기 관련 키워드)
    const categoryLower = category.toLowerCase();
    const rules = await this.prisma.keywordRule.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
    });

    // 카테고리 텍스트와 매칭되는 룰 찾기
    const matched = rules.filter((rule) => {
      const industryName = rule.industryName.toLowerCase();
      const sub = (rule.subCategory || "").toLowerCase();
      return (
        categoryLower.includes(industryName) ||
        categoryLower.includes(sub) ||
        industryName.includes(categoryLower.split(">").pop()?.trim() || "")
      );
    });

    if (matched.length === 0) {
      // 매칭 실패 시 일반 맛집 룰로 폴백
      const fallbackRules = rules.filter(
        (r) => r.industry === "korean_food",
      );
      matched.push(...fallbackRules);
    }

    // 지역명 추출
    const addressParts = address.split(" ");
    const city = addressParts[1]?.replace(/시$/, "") || "";
    const dong =
      addressParts.find(
        (p) => p.endsWith("동") || p.endsWith("읍") || p.endsWith("면"),
      ) || "";
    const region = district || city;

    // 패턴에 지역 대입하여 키워드 생성
    const keywords: string[] = [];
    for (const rule of matched) {
      let kw = rule.pattern
        .replace("{지역}", region)
        .replace("{동명}", dong || region);
      // 빈 지역 방지
      kw = kw.replace(/\+$/, "").replace(/^\+/, "").trim();
      if (kw.length >= 2 && !kw.includes("{")) {
        keywords.push(kw.replace("+", " "));
      }
    }

    // 중복 제거
    return [...new Set(keywords)];
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

  // 같은 지역+업종 경쟁매장 자동 탐색 (Chrome 불필요)
  private async findCompetitors(
    storeId: string,
    storeName: string,
    district: string,
    category: string,
  ) {
    if (!district) return;

    const query = `${district} ${category || "맛집"}`;
    this.logger.log(`경쟁매장 탐색: "${query}"`);

    try {
      // 네이버 검색 API로 주변 매장 검색
      const results = await this.naverSearch.searchPlace(query, 10);

      // 내 매장 제외 + 상위 5개
      const normalizedStoreName = storeName.replace(/\s+/g, "");
      const places = results
        .map((r) => r.title.replace(/<[^>]*>/g, "").trim())
        .filter((name) => {
          const normalized = name.replace(/\s+/g, "");
          return (
            normalized !== normalizedStoreName &&
            !normalized.includes(normalizedStoreName) &&
            !normalizedStoreName.includes(normalized) &&
            name.length >= 2 &&
            !/^\d+$/.test(name)
          );
        })
        .slice(0, 5);

      // 경쟁매장 저장 + Place API로 상세 데이터 수집
      for (const name of places) {
        try {
          // 경쟁사 플레이스 정보 조회
          let placeData: any = null;
          try {
            placeData = await this.naverPlace.searchAndGetPlaceInfo(name);
          } catch {}

          await this.prisma.competitor.create({
            data: {
              storeId,
              competitorName: name,
              competitorPlaceId: placeData?.id || undefined,
              category: category || undefined,
              type: "AUTO",
              receiptReviewCount: placeData?.visitorReviewCount || undefined,
              blogReviewCount: placeData?.blogReviewCount || undefined,
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
