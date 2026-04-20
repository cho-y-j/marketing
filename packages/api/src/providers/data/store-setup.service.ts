import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { NaverSearchProvider } from "../naver/naver-search.provider";
import { NaverPlaceProvider } from "../naver/naver-place.provider";
import { AIProvider } from "../ai/ai.provider";
import { KeywordDiscoveryService } from "../../modules/keyword/keyword-discovery.service";
import { RankCheckService } from "../../modules/keyword/rank-check.service";
import { AnalysisService } from "../../modules/analysis/analysis.service";
import { BriefingService } from "../../modules/briefing/briefing.service";
import { DailySnapshotJob } from "../../jobs/daily-snapshot.job";

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
    @Inject(forwardRef(() => RankCheckService))
    private rankCheckService: RankCheckService,
    @Inject(forwardRef(() => AnalysisService))
    private analysisService: AnalysisService,
    @Inject(forwardRef(() => BriefingService))
    private briefingService: BriefingService,
    @Inject(forwardRef(() => DailySnapshotJob))
    private dailySnapshotJob: DailySnapshotJob,
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

      // 2단계: AI 우선 키워드 생성 + 룰 보완 (AI가 메인, 룰은 안전망)
      await this.updateSetupStatus(storeId, "RUNNING", "AI가 키워드를 생성하는 중...");
      const aiKeywords = await this.generateSmartKeywords(
        store.name, address, category, district,
        {
          roadAddress: placeInfo?.roadAddress,
          placeId: store.naverPlaceId || undefined,
          reviewCount: placeInfo?.visitorReviewCount,
          blogReviewCount: placeInfo?.blogReviewCount,
        },
      );
      const ruleKeywords = await this.generateKeywordsFromRules(category, district, address);
      // AI 키워드 우선, 룰 키워드는 중복 제거 후 보완
      const ruleSet = new Set(ruleKeywords);
      // 사용자가 과거에 제외한 키워드는 재생성 시 제외
      const excluded = await this.prisma.excludedKeyword.findMany({
        where: { storeId },
        select: { keyword: true },
      });
      const excludedSet = new Set(excluded.map((e) => e.keyword));
      const keywords = [...ruleKeywords, ...aiKeywords.filter((k) => !ruleSet.has(k))]
        .filter((k) => !excludedSet.has(k));
      this.logger.log(`키워드 ${keywords.length}개 생성 (룰: ${ruleKeywords.length}, AI: ${aiKeywords.length}): ${keywords.join(", ")}`);

      // 1) 키워드 일괄 저장
      const createdKeywords: Array<{ id: string; keyword: string }> = [];
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
          createdKeywords.push({ id: created.id, keyword: kw });
        } catch (e: any) {
          if (!e.message?.includes("Unique")) {
            this.logger.warn(`키워드 추가 실패 [${kw}]: ${e.message}`);
          }
        }
      }
      const keywordCount = createdKeywords.length;

      // 2) 검색량 배치 조회 (5개씩, 검색광고 API 제한)
      await this.fetchVolumesBatch(createdKeywords);

      // 2-1) 저볼륨 필터 — 월 300 미만 AI 키워드는 제거 (회식/상견례/룸 계열은 저볼륨이라도 유지)
      const KEEP_KEYWORDS = /(회식|상견례|룸|단체|모임|돌잔치)/;
      const lowVolume = await this.prisma.storeKeyword.findMany({
        where: {
          storeId,
          type: { in: ["AI_RECOMMENDED", "MAIN"] },
          monthlySearchVolume: { lt: 300 },
        },
        select: { id: true, keyword: true },
      });
      const toDelete = lowVolume.filter((k) => !KEEP_KEYWORDS.test(k.keyword));
      if (toDelete.length > 0) {
        await this.prisma.storeKeyword.deleteMany({
          where: { id: { in: toDelete.map((k) => k.id) } },
        });
        this.logger.log(`저볼륨(<300) 키워드 ${toDelete.length}개 제거: ${toDelete.map(k => k.keyword).join(", ")}`);
      }

      // 3단계: 경쟁매장 탐색 (AI 생성 키워드 상위 3개로 다중 탐색)
      await this.updateSetupStatus(storeId, "RUNNING", "경쟁 매장을 찾는 중...");
      const updatedStore = await this.prisma.store.findUnique({ where: { id: storeId } });
      const finalDistrict = updatedStore?.district || district;
      const finalCategory = updatedStore?.category || category;
      // AI 키워드 중 구체적(지역+메뉴) 형태 우선 사용
      const competitorSearchQueries = aiKeywords
        .filter((k) => k.includes(" ") && !k.includes("맛집")) // 지역+메뉴 형태
        .slice(0, 3);
      if (competitorSearchQueries.length === 0) {
        competitorSearchQueries.push(`${finalDistrict} ${finalCategory.split(/[>,]/)[0].trim() || "맛집"}`.replace(/,/g, ""));
      }
      await this.findCompetitorsByQueries(storeId, store.name, competitorSearchQueries, finalCategory);

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

      // 6단계: 첫 순위 체크 — 가입 당일 내 키워드별 현재 순위 확보 (증감 기준선)
      await this.updateSetupStatus(storeId, "RUNNING", "키워드 순위를 체크하는 중...");
      try {
        await this.rankCheckService.checkAllKeywordRanks(storeId);
        this.logger.log(`첫 순위 체크 완료`);
      } catch (e: any) {
        this.logger.warn(`첫 순위 체크 실패 (나중에 재시도 가능): ${e.message}`);
      }

      // 7단계: 첫 일별 스냅샷 — 리뷰/검색량 기준선 확보
      await this.updateSetupStatus(storeId, "RUNNING", "리뷰 기준선을 기록하는 중...");
      try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        await this.dailySnapshotJob.collectStoreSnapshots(today);
        await this.dailySnapshotJob.collectCompetitorSnapshots(today);
        this.logger.log(`첫 스냅샷 기록 완료`);
      } catch (e: any) {
        this.logger.warn(`첫 스냅샷 실패 (나중에 재시도 가능): ${e.message}`);
      }

      // 8단계: 첫 브리핑 생성
      await this.updateSetupStatus(storeId, "RUNNING", "오늘의 브리핑을 생성하는 중...");
      try {
        await this.briefingService.generateDailyBriefing(storeId);
        this.logger.log(`첫 브리핑 생성 완료`);
      } catch (e: any) {
        this.logger.warn(`첫 브리핑 생성 실패 (나중에 재시도 가능): ${e.message}`);
      }

      // 9단계: 셋업 완료
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
    // 1차: placeId로 직접 조회 (지번주소 우선 — 행정동 추출에 유리)
    try {
      const detail = await this.naverPlace.getPlaceDetail(placeId);
      if (detail && (detail.address || detail.roadAddress)) {
        const jibunAddr = detail.address || "";
        const roadAddr = detail.roadAddress || "";
        // 행정동 추출은 지번주소에서 (건물동 제외 로직이 동작)
        const effectiveAddr = jibunAddr || roadAddr;
        return {
          address: effectiveAddr,
          roadAddress: roadAddr,
          category: detail.category || "",
          district: this.extractDistrict(effectiveAddr),
          phone: detail.phone || "",
          visitorReviewCount: detail.visitorReviewCount,
          blogReviewCount: detail.blogReviewCount,
          saveCount: detail.saveCount,
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
        const jibunAddr = best.address || "";
        const roadAddr = best.roadAddress || "";
        const effectiveAddr = jibunAddr || roadAddr;
        return {
          address: effectiveAddr,
          roadAddress: roadAddr,
          category: best.category || "",
          district: this.extractDistrict(effectiveAddr),
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

  // 주소에서 지역명 추출 (구 단위 우선, 행정동 있으면 추가)
  private extractDistrict(address: string): string {
    if (!address) return "";
    const parts = address.split(" ").filter(Boolean);

    // 시/도 추출 (특별시/광역시 시 제거, 일반 시는 유지)
    let city = "";
    for (const p of parts) {
      if (p.endsWith("특별시") || p.endsWith("광역시") || p.endsWith("자치시")) {
        city = p.replace(/(특별|광역|자치)?시$/, "");
        break;
      }
      if (p.endsWith("시") && !p.endsWith("특별시")) {
        city = p.replace(/시$/, "");
        break;
      }
    }

    // 구 추출 (우선)
    const gu = parts.find((p) => p.endsWith("구") && p.length >= 3);

    // 행정동 추출 — 건물동(A동/B동 등 한 글자 + 동) 제외
    // "공덕동" OK, "B동"/"A동"/"101동" 제외
    const dong = parts.find((p) => {
      if (!p.endsWith("동") && !p.endsWith("읍") && !p.endsWith("면")) return false;
      // 한 글자 + 동 (건물동)
      if (p.length === 2 && /^[가-힣A-Z]동$/.test(p)) return false;
      // 숫자 + 동 (아파트동)
      if (/^\d+동$/.test(p)) return false;
      // "동" 한 글자
      if (p === "동") return false;
      return true;
    });

    // 조합: 구 우선, 행정동이 있으면 추가
    if (gu && dong) return `${gu} ${dong}`;
    if (gu) return `${city} ${gu}`.trim();
    if (dong) return `${city} ${dong}`.trim();
    return city;
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

    // 지역명 추출 (extractDistrict와 동일한 규칙 - 건물동 제외)
    const addressParts = address.split(" ").filter(Boolean);
    const city = addressParts[1]?.replace(/시$/, "") || "";
    const dong = addressParts.find((p) => {
      if (!p.endsWith("동") && !p.endsWith("읍") && !p.endsWith("면")) return false;
      if (p.length === 2 && /^[가-힣A-Z]동$/.test(p)) return false;
      if (/^\d+동$/.test(p)) return false;
      if (p === "동") return false;
      return true;
    }) || "";
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

  // AI가 플레이스 정보 전체를 분석해서 실전 키워드 생성
  private async generateSmartKeywords(
    storeName: string,
    address: string,
    category: string,
    district: string,
    extraInfo?: {
      roadAddress?: string;
      placeId?: string;
      reviewCount?: number;
      blogReviewCount?: number;
    },
  ): Promise<string[]> {
    // 주소 분해 (시/구/동 힌트)
    const addrParts = address.split(" ").filter(Boolean);
    const city = addrParts.find((p) => p.endsWith("특별시") || p.endsWith("광역시") || p.endsWith("시"))?.replace(/(특별|광역)?시$/, "") || "";
    const gu = addrParts.find((p) => p.endsWith("구") && p.length >= 3);
    const dong = addrParts.find((p) => {
      if (!p.endsWith("동") && !p.endsWith("읍") && !p.endsWith("면")) return false;
      if (p.length === 2 && /^[가-힣A-Z]동$/.test(p)) return false;
      if (/^\d+동$/.test(p)) return false;
      return p !== "동";
    });

    // 매장명에서 지명 힌트 추출 (예: "창심관 공덕직영점" → "공덕")
    const brandLocationHint = storeName.match(/([가-힣]{2,4}?)(직영점|역점|지점|점)/)?.[1];

    // 카테고리 분해 (예: "한식 > 아귀찜,해물찜" → ["한식", "아귀찜", "해물찜"])
    const categoryParts = category
      .split(/[>,]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    // 지역 힌트 — 매장명 브랜드 힌트(공덕) 우선, 없으면 행정동 → 구
    // (이유: 매장이 '도화동'에 있어도 고객은 '공덕역 맛집'으로 검색 — 브랜드 지명이 유입 핵심)
    const regionHint = brandLocationHint || dong?.replace(/동$/, "") || gu?.replace(/구$/, "") || "";

    // 의뢰자(마케팅 전문가) 공식 프롬프트 — 임의 변경 금지
    const systemPrompt = `특정 매장 기준으로 검색 키워드를 구성해줘.
단순 검색량 기준이 아니라, 실제 고객 유입 흐름을 반영해서 키워드를 만들어줘.

조건은 아래 기준을 반드시 지켜줘.

1. 지역 키워드는 '지역명' + '지역명+역' 형태를 모두 포함할 것
2. 키워드는 반드시 아래 3가지 구조로 나눌 것
   - 유입 키워드 (예: 맛집)
   - 상황 키워드 (예: 점심, 술집 등)
   - 메뉴 키워드 (예: 대표 음식명)
3. 각 카테고리를 균형 있게 포함하여 총 10개 이하로 구성할 것
4. 고객 검색 흐름을 반영할 것 (유입 → 상황 → 메뉴 선택 단계)
5. 실제 매장 방문으로 이어질 가능성이 높은 구조로 구성할 것
6. 업종이 명확한 경우, '고기집'과 같은 포괄적인 키워드는 제외하고 대표 메뉴 또는 세부 카테고리 키워드 중심으로 구성할 것
7. 단순 정보 탐색이 아닌, 실제 방문 의도가 있는 키워드만 포함할 것
8. 유사 의미 키워드는 중복되지 않도록 최적화할 것

※ 출력은 설명 없이 키워드만 JSON 배열 형태로 제공할 것. 예: ["공덕 맛집", "공덕역 맛집", "공덕 아구찜"]`;

    const userPrompt = `매장 정보:
- 매장명: ${storeName}
- 지역명(역명 조합 기준): ${regionHint || "-"}
- 구/동: ${gu || "-"} / ${dong || "-"}
- 도로명주소: ${extraInfo?.roadAddress || address}
- 카테고리: ${category}
- 대표 메뉴/세부 카테고리: ${categoryParts.join(", ") || "-"}

위 조건을 지켜서 키워드 JSON 배열만 응답.`;

    try {
      const response = await this.ai.analyze(systemPrompt, userPrompt);
      const match = response.content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const cleaned = parsed
          .filter((k: any) => typeof k === "string")
          .map((k: string) => k.trim().replace(/,/g, ""))
          .filter((k: string) => k.length >= 2 && k.length <= 30);
        if (cleaned.length > 0) {
          this.logger.log(`AI 키워드 생성 [${response.provider}]: ${cleaned.length}개`);
          return cleaned;
        }
      }
    } catch (e: any) {
      this.logger.warn(`AI 키워드 생성 실패: ${e.message}`);
    }

    // AI 완전 실패 시 최소 폴백
    const fallback: string[] = [];
    const region = dong || gu || district || city;
    if (region) {
      for (const cat of categoryParts.slice(0, 3)) {
        fallback.push(`${region} ${cat}`);
      }
      fallback.push(`${region} 맛집`);
    }
    if (storeName) fallback.push(storeName);
    return fallback;
  }

  // 여러 쿼리로 경쟁매장 탐색 (AI 키워드 활용)
  private async findCompetitorsByQueries(
    storeId: string,
    storeName: string,
    queries: string[],
    category: string,
  ) {
    const normalizedStoreName = storeName.replace(/\s+/g, "");
    const foundNames = new Set<string>();
    const candidates: Array<{ name: string }> = [];

    for (const query of queries) {
      try {
        this.logger.log(`경쟁매장 탐색: "${query}"`);
        const results = await this.naverSearch.searchPlace(query, 10);
        for (const r of results) {
          const name = r.title.replace(/<[^>]*>/g, "").trim();
          const normalized = name.replace(/\s+/g, "");
          if (
            !foundNames.has(name) &&
            normalized !== normalizedStoreName &&
            !normalized.includes(normalizedStoreName) &&
            !normalizedStoreName.includes(normalized) &&
            name.length >= 2 &&
            !/^\d+$/.test(name)
          ) {
            foundNames.add(name);
            candidates.push({ name });
          }
        }
      } catch (e: any) {
        this.logger.warn(`경쟁매장 탐색 실패 [${query}]: ${e.message}`);
      }
    }

    // 상위 8개만
    const topCompetitors = candidates.slice(0, 8);

    // 각 경쟁사 저장 + Place API로 상세 데이터 + 검색광고 API로 일 검색량 수집
    for (const c of topCompetitors) {
      try {
        let placeData: any = null;
        let dailySearch: number | undefined;

        try {
          placeData = await this.naverPlace.searchAndGetPlaceInfo(c.name);
        } catch {}

        // 브랜드 검색량 (해당 경쟁사를 사람들이 검색하는 일일 횟수)
        try {
          const stats = await this.searchad.getKeywordStats([c.name.replace(/\s+/g, "").replace(/,/g, "")]);
          if (stats.length > 0) {
            const monthly = this.searchad.getTotalMonthlySearch(stats[0]);
            if (monthly > 0) dailySearch = Math.round(monthly / 30);
          }
        } catch {}

        await this.prisma.competitor.create({
          data: {
            storeId,
            competitorName: c.name,
            competitorPlaceId: placeData?.id || undefined,
            category: category || undefined,
            type: "AUTO",
            receiptReviewCount: placeData?.visitorReviewCount || undefined,
            blogReviewCount: placeData?.blogReviewCount || undefined,
            dailySearchVolume: dailySearch,
            lastComparedAt: new Date(),
          },
        });
      } catch {}
    }

    this.logger.log(`경쟁매장 ${topCompetitors.length}개 등록: ${topCompetitors.map((c) => c.name).join(", ")}`);
  }

  // 같은 지역+업종 경쟁매장 자동 탐색 (레거시 - 단일 쿼리)
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

  // 키워드 검색량 조회 (단건)
  private async fetchVolume(keywordId: string, keyword: string) {
    try {
      const searchTerm = keyword.replace(/\s+/g, "");
      const stats = await this.searchad.getKeywordStats([searchTerm]);
      if (stats.length > 0) {
        const match = stats.find((s) => s.relKeyword === searchTerm) || stats[0];
        const volume = this.searchad.getTotalMonthlySearch(match);
        await this.prisma.storeKeyword.update({
          where: { id: keywordId },
          data: { monthlySearchVolume: volume, lastCheckedAt: new Date() },
        });
      }
    } catch {}
  }

  /**
   * 배치 검색량 조회 — 5개씩 검색광고 API 호출
   * 네이버 API는 hintKeywords 최대 5개 권장
   */
  private async fetchVolumesBatch(items: Array<{ id: string; keyword: string }>) {
    const BATCH_SIZE = 5;
    let updated = 0;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      // 공백/쉼표 제거
      const cleanMap = new Map(batch.map((b) => [b.keyword, b.keyword.replace(/\s+/g, "").replace(/,/g, "")]));
      const searchTerms = [...new Set(cleanMap.values())].filter(Boolean);
      if (searchTerms.length === 0) continue;
      try {
        const stats = await this.searchad.getKeywordStats(searchTerms);
        // 응답에서 우리가 요청한 키워드만 매칭
        const requestedSet = new Set(searchTerms);
        const ourStats = stats.filter((s) => requestedSet.has(s.relKeyword));

        // 각 키워드별 update
        for (const item of batch) {
          const searchTerm = cleanMap.get(item.keyword);
          const matched = ourStats.find((s) => s.relKeyword === searchTerm);
          const volume = matched ? this.searchad.getTotalMonthlySearch(matched) : 0;
          try {
            await this.prisma.storeKeyword.update({
              where: { id: item.id },
              data: {
                monthlySearchVolume: volume,
                lastCheckedAt: new Date(),
              },
            });
            if (volume > 0) updated++;
          } catch {}
        }
      } catch (e: any) {
        this.logger.warn(`검색량 배치 조회 실패 [${searchTerms.join(",")}]: ${e.message}`);
      }
      // rate limit 회피
      await new Promise((r) => setTimeout(r, 200));
    }
    this.logger.log(`검색량 조회 완료: ${updated}/${items.length}개 키워드에 검색량 있음`);
  }
}
