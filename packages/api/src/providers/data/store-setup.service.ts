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
import { CompetitorBackfillService } from "../../modules/competitor/competitor-backfill.service";

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
    @Inject(forwardRef(() => CompetitorBackfillService))
    private backfillService: CompetitorBackfillService,
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

      // 2단계: Claude CLI 단독 키워드 생성 (룰 기반 제거 — "단양군 단양읍 음식점>한식" 같은 쓰레기 방지)
      await this.updateSetupStatus(storeId, "RUNNING", "AI가 매장 맞춤 키워드를 생성하는 중...");
      const aiKeywords = await this.generateSmartKeywords(
        store.name, address, category, district,
        {
          roadAddress: placeInfo?.roadAddress,
          placeId: store.naverPlaceId || undefined,
          reviewCount: placeInfo?.visitorReviewCount,
          blogReviewCount: placeInfo?.blogReviewCount,
        },
      );
      // 사용자가 과거에 제외한 키워드는 재생성 시 제외
      const excluded = await this.prisma.excludedKeyword.findMany({
        where: { storeId },
        select: { keyword: true },
      });
      const excludedSet = new Set(excluded.map((e) => e.keyword));
      const keywords = aiKeywords.filter((k) => !excludedSet.has(k));
      this.logger.log(`AI 키워드 ${keywords.length}개 생성: ${keywords.join(", ")}`);

      // fail-fast: 키워드 2개 미만이면 가입 실패 처리 (저볼륨 필터가 남기는 최소 1~2개 허용)
      if (keywords.length < 2) {
        throw new Error(
          `키워드 생성 실패 — ${keywords.length}개만 생성됨 (최소 2개 필요). 네이버 Place 주소/카테고리 파싱을 확인하세요.`,
        );
      }

      // 1) 키워드 일괄 저장 (모두 AI_RECOMMENDED)
      const createdKeywords: Array<{ id: string; keyword: string }> = [];
      for (const kw of keywords) {
        try {
          const created = await this.prisma.storeKeyword.create({
            data: {
              storeId,
              keyword: kw,
              type: "AI_RECOMMENDED",
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

      // 2-1) 저볼륨 필터 — 지방 소규모 지역 매장은 지역명 키워드 유지
      // 규칙: 월 300 미만이라도 "매장 지역명 포함" 또는 "회식 등 전환 높은 키워드"는 유지
      const KEEP_KEYWORDS = /(회식|상견례|룸|단체|모임|돌잔치)/;
      const addressParts = address.split(/\s+/).filter(Boolean);
      // 매장명 브랜드 힌트도 지역 토큰으로 포함 (예: "공덕직영점" → "공덕")
      const brandHintForFilter = store.name.match(/([가-힣]{2,4}?)(직영점|역점|지점|점)/)?.[1];
      const regionTokens = [
        ...addressParts.map((p: string) => p.replace(/(시|군|구|동|읍|면)$/, "")),
        ...(district || "").split(/\s+/).map((p: string) => p.replace(/(시|군|구|동|읍|면)$/, "")),
        ...(brandHintForFilter ? [brandHintForFilter] : []),
      ].filter((t: string) => t.length >= 2);
      const includesRegion = (kw: string) => regionTokens.some((t) => kw.includes(t));
      const lowVolume = await this.prisma.storeKeyword.findMany({
        where: {
          storeId,
          type: { in: ["AI_RECOMMENDED", "MAIN"] },
          monthlySearchVolume: { lt: 300 },
        },
        select: { id: true, keyword: true },
      });
      const toDelete = lowVolume.filter(
        (k) => !KEEP_KEYWORDS.test(k.keyword) && !includesRegion(k.keyword),
      );
      if (toDelete.length > 0) {
        // 전부 날아가지 않게 최소 2개는 유지
        const currentKept = await this.prisma.storeKeyword.count({
          where: { storeId, type: { in: ["AI_RECOMMENDED", "MAIN"] } },
        });
        if (currentKept - toDelete.length >= 2) {
          await this.prisma.storeKeyword.deleteMany({
            where: { id: { in: toDelete.map((k) => k.id) } },
          });
          this.logger.log(`저볼륨(<300) 키워드 ${toDelete.length}개 제거: ${toDelete.map((k) => k.keyword).join(", ")}`);
        } else {
          this.logger.log(`저볼륨 키워드 제거 skip — 제거 시 키워드 2개 미만이 되어 유지`);
        }
      }

      // 3단계: 경쟁매장 탐색 (AI 생성 키워드 상위 3개로 다중 탐색)
      await this.updateSetupStatus(storeId, "RUNNING", "경쟁 매장을 찾는 중...");
      const updatedStore = await this.prisma.store.findUnique({ where: { id: storeId } });
      const finalDistrict = updatedStore?.district || district;
      const finalCategory = updatedStore?.category || category;
      // 경쟁사 검색 쿼리 3종 조합: 지역+맛집 / 지역+대표메뉴 / AI 키워드 상위 1개
      const competitorSearchQueries: string[] = [];
      const searchRegion =
        finalDistrict?.split(/\s+/).pop() || // "마포구 도화동" → "도화동"
        (placeInfo?.address || "").split(/\s+/).filter(Boolean).slice(-2, -1)[0] ||
        "";
      const searchMenu = (finalCategory ?? "")
        .split(/[>,]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length >= 2 && s.length <= 6 && !["음식점", "한식"].includes(s))[0];
      if (searchRegion) {
        competitorSearchQueries.push(`${searchRegion} 맛집`.replace(/,/g, ""));
        if (searchMenu) {
          competitorSearchQueries.push(`${searchRegion} ${searchMenu}`.replace(/,/g, ""));
        }
      }
      // AI 키워드 중 지역+메뉴 형태 하나 추가
      const aiMenuQuery = aiKeywords.find(
        (k) => k.includes(" ") && !competitorSearchQueries.some((q) => q === k),
      );
      if (aiMenuQuery) competitorSearchQueries.push(aiMenuQuery);
      this.logger.log(`경쟁사 검색 쿼리: ${competitorSearchQueries.join(" / ")}`);
      await this.findCompetitorsByQueries(
        storeId,
        store.name,
        competitorSearchQueries,
        finalCategory,
        {
          visitorReviewCount: placeInfo?.visitorReviewCount,
          blogReviewCount: placeInfo?.blogReviewCount,
          address: placeInfo?.address || store.address,
        },
      );

      const competitorCount = await this.prisma.competitor.count({ where: { storeId } });

      // fail-fast: 경쟁사 2곳 미만이면 실패 처리
      if (competitorCount < 2) {
        throw new Error(
          `경쟁사 선별 실패 — ${competitorCount}곳만 등록됨 (최소 2곳 필요). AI 선별 결과와 네이버 검색 결과를 확인하세요.`,
        );
      }

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
      await this.rankCheckService.checkAllKeywordRanks(storeId);
      // 최소 1개 키워드는 순위 잡혀야 정상 셋업 (Top 50 밖이어도 rank=null 로 기록되지만, 체크 자체 실패는 에러)
      const checkedCount = await this.prisma.storeKeyword.count({
        where: { storeId, lastCheckedAt: { not: null } },
      });
      if (checkedCount < 1) {
        throw new Error(`순위 체크 실패 — 0개 키워드 체크됨. 네이버 검색 엔진을 확인하세요.`);
      }
      this.logger.log(`첫 순위 체크 완료 — ${checkedCount}개 키워드 체크`);

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

      // 7-2단계: 과거 30일 역산 backfill — 가입 즉시 추이 차트 확보
      await this.updateSetupStatus(storeId, "RUNNING", "과거 30일 추이를 역산하는 중...");
      try {
        await this.backfillService.backfillStore(storeId);
        await this.backfillService.backfillAllCompetitors(storeId);
        this.logger.log(`30일 역산 backfill 완료`);
      } catch (e: any) {
        this.logger.warn(`30일 backfill 실패 (나중에 재시도 가능): ${e.message}`);
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
    // 읍/면/동 접미사 모두 제거 (단양읍 → 단양, 공덕동 → 공덕)
    const regionHint =
      brandLocationHint ||
      dong?.replace(/(동|읍|면)$/, "") ||
      gu?.replace(/구$/, "") ||
      "";

    // AI 혼란 방지: 접미사 제거
    const cleanDong = dong?.replace(/(동|읍|면)$/, "");
    const cleanGu = gu?.replace(/구$/, "");

    // 의뢰자(마케팅 전문가) 공식 프롬프트 — AI가 먼저 지역 맥락을 추론한 뒤 키워드 생성
    const systemPrompt = `당신은 자영업 마케팅 전문가. 주어진 매장에 대해 **먼저 지역 맥락을 파악**한 뒤, 실제 고객 유입으로 이어지는 검색 키워드를 생성해야 함.

## 작업 순서

### 1단계: 지역 분석 (너 머릿속에서 먼저 판단)
- **핵심 유입 지역명**: 고객이 실제 검색할 때 쓰는 **순수 지역명**
  - **절대 규칙 — 다음 접미사는 절대 붙이지 마라**: "동", "읍", "면", "군", "구", "시"
  - ❌ "단양읍", "단양군", "마포구", "도화동", "강남구"
  - ✓ "단양", "마포", "강남", "공덕"
  - 행정 경계가 아닌 **상권/역 이름 우선**:
    - 주소가 "서울 마포구 도화동"이고 매장명이 "공덕직영점" → 핵심 지역은 **"공덕"** (도화 X, 마포 X)
    - 주소가 "충북 단양군 단양읍" → 핵심 지역은 **"단양"** (단양읍 X, 단양군 X)
- **주변 지하철역**: 매장 반경 1km 내 지하철역 (있으면 최대 2개, 없으면 null)
- **주변 상권/랜드마크**: 유명 상권명 (있으면 최대 2개, 없으면 null)
  예: 강남역 주변 → "뱅뱅사거리", "신논현"

### 2단계: 키워드 생성 — 아래 규칙 **모두** 준수
1. 지역 키워드:
   - 지하철역이 있으면 '지역명' + '지역명+역' 두 형태 (예: 공덕 맛집, 공덕역 맛집)
   - 역이 없는 지방 지역은 '지역명'만 (억지로 '역' 붙이지 말 것)
   - 추가 상권/랜드마크가 있으면 포함 (예: 뱅뱅사거리 맛집)
2. 키워드는 3가지 카테고리로 분류해서 생성:
   - **유입** (예: 맛집, 식당) — 최소 2개
   - **상황** (예: 회식, 점심, 데이트, 가족모임, 혼밥) — 최소 2개
   - **메뉴** (예: 아구찜, 소고기 같은 세부 메뉴) — 최소 2개
3. 총 7~10개로 구성
4. 고객 검색 흐름 반영 (유입 → 상황 → 메뉴)
5. '고기집', '한식', '음식점' 같은 포괄적 키워드 **단독 사용 금지** — 반드시 지역명 결합 or 세부 메뉴
6. 카테고리 원문 절대 포함 금지 (예: "음식점>한식" ❌)
7. 단순 정보 탐색 키워드 금지 (예: "한식 역사" ❌)
8. 유사 의미 키워드 중복 최소화

## 출력 형식 (JSON만, 설명 없이)

\`\`\`json
{
  "analysis": {
    "primaryRegion": "공덕",
    "subwayStations": ["공덕역"],
    "landmarks": ["공덕오거리"]
  },
  "keywords": [
    {"kw": "공덕 맛집", "category": "유입"},
    {"kw": "공덕역 맛집", "category": "유입"},
    {"kw": "공덕 회식", "category": "상황"},
    {"kw": "공덕역 회식", "category": "상황"},
    {"kw": "공덕 점심", "category": "상황"},
    {"kw": "공덕 아구찜", "category": "메뉴"},
    {"kw": "공덕 해물찜", "category": "메뉴"},
    {"kw": "공덕역 아구찜", "category": "메뉴"}
  ]
}
\`\`\`

## 예시 — 육목원 (강남 소고기집)
\`\`\`json
{
  "analysis": {"primaryRegion": "강남", "subwayStations": ["강남역"], "landmarks": ["뱅뱅사거리"]},
  "keywords": [
    {"kw": "강남 맛집", "category": "유입"},
    {"kw": "강남역 맛집", "category": "유입"},
    {"kw": "강남 회식", "category": "상황"},
    {"kw": "강남역 회식", "category": "상황"},
    {"kw": "강남 소고기", "category": "메뉴"},
    {"kw": "강남역 소고기", "category": "메뉴"},
    {"kw": "뱅뱅사거리 맛집", "category": "유입"}
  ]
}
\`\`\`

## 예시 — 지방 매장 (단양 보리밥집, 역 없음)
\`\`\`json
{
  "analysis": {"primaryRegion": "단양", "subwayStations": null, "landmarks": ["수안보"]},
  "keywords": [
    {"kw": "단양 맛집", "category": "유입"},
    {"kw": "단양 한정식", "category": "유입"},
    {"kw": "단양 가족모임", "category": "상황"},
    {"kw": "단양 점심", "category": "상황"},
    {"kw": "단양 보리밥", "category": "메뉴"},
    {"kw": "단양 흑마늘", "category": "메뉴"},
    {"kw": "수안보 맛집", "category": "유입"}
  ]
}
\`\`\``;

    const userPrompt = `매장 정보:
- 매장명: ${storeName}
- 주소: ${extraInfo?.roadAddress || address}
- 매장명 브랜드 지역 힌트: ${brandLocationHint || "-"} (있으면 도로명주소보다 우선)
- 구/동(정제): ${cleanGu || "-"} / ${cleanDong || "-"}
- 업종 카테고리: ${category}
- 대표 메뉴/세부 카테고리: ${categoryParts.join(", ") || "-"}
- 리뷰 규모: 방문자 ${extraInfo?.reviewCount ?? "?"}건 / 블로그 ${extraInfo?.blogReviewCount ?? "?"}건

위 매장에 대해 1단계 지역 분석 → 2단계 키워드 생성 → JSON 출력. 설명 없이 JSON만.`;

    // AI 호출 + 검증 + 1회 재시도
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.ai.analyze(systemPrompt, userPrompt);
        const match = response.content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const analysis = parsed.analysis || {};
          const kwEntries: Array<{ kw: string; category: string }> = parsed.keywords || [];
          const rawKws = kwEntries.map((k) => k.kw).filter((s) => typeof s === "string");

          // 분석 결과 로그
          this.logger.log(
            `AI 지역 분석 [${response.provider}] — 핵심지역: ${analysis.primaryRegion}, 역: ${JSON.stringify(analysis.subwayStations)}, 랜드마크: ${JSON.stringify(analysis.landmarks)}`,
          );

          // 지역 힌트: AI가 뽑은 primaryRegion 우선, 없으면 내가 추출한 regionHint
          const effectiveRegion = analysis.primaryRegion || regionHint || cleanGu || cleanDong || "";
          const cleaned = this.sanitizeKeywords(rawKws, effectiveRegion);

          // 카테고리별 분포 검증
          const byCategory: Record<string, number> = {};
          for (const e of kwEntries) {
            if (cleaned.includes(e.kw?.trim())) {
              byCategory[e.category] = (byCategory[e.category] || 0) + 1;
            }
          }
          const balanced =
            (byCategory["유입"] || 0) >= 2 &&
            (byCategory["메뉴"] || 0) >= 1 &&
            cleaned.length >= 5;

          if (balanced) {
            this.logger.log(
              `AI 키워드 검증 통과 (시도 ${attempt}) — 유입 ${byCategory["유입"] || 0} / 상황 ${byCategory["상황"] || 0} / 메뉴 ${byCategory["메뉴"] || 0}: ${cleaned.join(", ")}`,
            );
            return cleaned;
          }
          this.logger.warn(
            `AI 키워드 검증 실패 (시도 ${attempt}) — 유입 ${byCategory["유입"] || 0} 메뉴 ${byCategory["메뉴"] || 0} 총 ${cleaned.length} — ${attempt < 2 ? "재시도" : "폴백"}`,
          );
        }
      } catch (e: any) {
        this.logger.warn(`AI 키워드 생성 실패 (시도 ${attempt}): ${e.message}`);
      }
    }

    // AI 완전 실패 시: 매우 보수적 최소 폴백 (지역+맛집 형태만)
    const fallback: string[] = [];
    const primaryRegion = brandLocationHint || dong?.replace(/동$/, "") || gu?.replace(/구$/, "");
    if (primaryRegion) {
      fallback.push(`${primaryRegion} 맛집`);
      fallback.push(`${primaryRegion}역 맛집`);
    }
    // 대표 메뉴 1개만 (카테고리 원문 X, 세부 메뉴만)
    const safeMenus = categoryParts.filter(
      (c) => !c.includes(">") && c.length >= 2 && c.length <= 6 && !["음식점", "한식", "양식", "일식", "중식", "기타"].includes(c),
    );
    if (primaryRegion && safeMenus.length > 0) {
      fallback.push(`${primaryRegion} ${safeMenus[0]}`);
    }
    return this.sanitizeKeywords(fallback, primaryRegion || "");
  }

  /**
   * 키워드 저장 전 엄격한 검증.
   * - 카테고리 원문 패턴 차단 ('>' 포함)
   * - 포괄어 단독 차단 ("맛집", "한식", "고기집" 등)
   * - 지역 포함 필수 (regionHint 가 있으면 해당 지역명이 포함된 것만)
   * - 길이 2~30자
   * - 중복 제거
   */
  private sanitizeKeywords(raw: string[], regionHint: string): string[] {
    const POLYMERIC_TERMS = new Set([
      "맛집", "한식", "양식", "일식", "중식", "분식", "음식점", "고기집",
      "술집", "카페", "치킨", "피자", "족발", "보쌈", "고기", "식당",
    ]);
    const result: string[] = [];
    const seen = new Set<string>();
    for (const raw0 of raw) {
      if (typeof raw0 !== "string") continue;
      // 1차 정제: trim, 쉼표 제거, 공백 정규화
      let k = raw0.trim().replace(/,/g, "").replace(/\s+/g, " ");
      // 2차 정제: 지명 접미사 자동 제거 — "단양읍 맛집" → "단양 맛집", "마포구 맛집" → "마포 맛집"
      //   주의: "공덕역"처럼 역명은 유지, "도화동" 같은 행정동명은 축약
      k = k.replace(/([가-힣]{2,4})(읍|면|군)(\s|$)/g, "$1$3");
      // "{지명}구" 도 제거 (단 "중구" 같은 1글자 구명은 유지)
      k = k.replace(/([가-힣]{3,})(구)(\s|$)/g, "$1$3");
      // "{지명}동" 도 제거 (브랜드 힌트가 더 구체적이므로 행정동 → 지명으로 축약)
      k = k.replace(/([가-힣]{2,})(동)(\s|$)/g, (match, name, _suffix, tail) => {
        // "공덕동" → "공덕"으로. 단 "역동" 같은 기능어는 유지.
        if (["역동", "서동", "북동", "남동"].includes(name + "동")) return match;
        return name + tail;
      });
      k = k.trim().replace(/\s+/g, " ");

      if (k.length < 2 || k.length > 30) continue;
      if (k.includes(">")) continue;
      if (k.includes("{") || k.includes("}")) continue;
      if (POLYMERIC_TERMS.has(k)) continue;
      if (regionHint && !k.includes(regionHint)) continue;
      const norm = k.replace(/\s+/g, "");
      if (seen.has(norm)) continue;
      seen.add(norm);
      result.push(k);
    }
    return result.slice(0, 10);
  }

  /**
   * 2단계 AI 경쟁사 선별:
   *  1단계: 네이버에서 지역+메뉴 키워드로 상위 20개 매장 수집 + Place 데이터 (리뷰 수, 카테고리)
   *  2단계: Claude CLI에 "내 매장 정보 + 후보 20개" 전달 → 진짜 경쟁사 6~8곳 선별
   *    판단 기준: 같은 상권 / 같은 업종 / 내 매장보다 리뷰 많거나 비슷한 매장 / 체인점/무관 제외
   */
  private async findCompetitorsByQueries(
    storeId: string,
    storeName: string,
    queries: string[],
    category: string,
    myStore?: { visitorReviewCount?: number | null; blogReviewCount?: number | null; address?: string | null },
  ) {
    const normalizedStoreName = storeName.replace(/\s+/g, "");
    const foundNames = new Set<string>();
    type Candidate = {
      name: string;
      placeId?: string;
      category?: string;
      address?: string;
      visitorReviewCount?: number;
      blogReviewCount?: number;
    };
    const candidates: Candidate[] = [];

    // 1단계: 네이버 검색 상위 매장 수집 (쿼리당 10개 × queries)
    for (const query of queries) {
      try {
        this.logger.log(`[경쟁사 후보 수집] "${query}"`);
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
            candidates.push({
              name,
              category: r.category,
              address: r.roadAddress || r.address,
            });
          }
        }
      } catch (e: any) {
        this.logger.warn(`경쟁사 후보 수집 실패 [${query}]: ${e.message}`);
      }
    }

    if (candidates.length === 0) {
      this.logger.warn(`경쟁사 후보 0개 — 네이버 검색 실패`);
      return;
    }

    // Place API로 각 후보의 리뷰 수 보강 (최대 20개만)
    const enriched: Candidate[] = [];
    for (const c of candidates.slice(0, 20)) {
      try {
        const info = await this.naverPlace.searchAndGetPlaceInfo(c.name);
        if (info) {
          enriched.push({
            ...c,
            placeId: info.id,
            category: info.category || c.category,
            address: info.roadAddress || info.address || c.address,
            visitorReviewCount: info.visitorReviewCount,
            blogReviewCount: info.blogReviewCount,
          });
        } else {
          enriched.push(c);
        }
      } catch {
        enriched.push(c);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // 2단계: Claude CLI로 진짜 경쟁사 선별
    const selected = await this.aiSelectCompetitors(
      storeName,
      category,
      myStore?.address || "",
      myStore?.visitorReviewCount ?? 0,
      myStore?.blogReviewCount ?? 0,
      enriched,
    );
    this.logger.log(`AI 선별 경쟁사 ${selected.length}개: ${selected.map((c) => c.name).join(", ")}`);

    // 3단계: 선별된 경쟁사 저장 + 브랜드 검색량 조회
    for (const c of selected) {
      let dailySearch: number | undefined;
      try {
        const stats = await this.searchad.getKeywordStats([c.name.replace(/\s+/g, "").replace(/,/g, "")]);
        if (stats.length > 0) {
          const monthly = this.searchad.getTotalMonthlySearch(stats[0]);
          if (monthly > 0) dailySearch = Math.round(monthly / 30);
        }
      } catch {}

      try {
        await this.prisma.competitor.create({
          data: {
            storeId,
            competitorName: c.name,
            competitorPlaceId: c.placeId || undefined,
            category: c.category || category || undefined,
            type: "AUTO",
            receiptReviewCount: c.visitorReviewCount || undefined,
            blogReviewCount: c.blogReviewCount || undefined,
            dailySearchVolume: dailySearch,
            lastComparedAt: new Date(),
          },
        });
      } catch (e: any) {
        this.logger.warn(`경쟁사 저장 실패 [${c.name}]: ${e.message}`);
      }
    }
  }

  /**
   * Claude CLI에 "내 매장 + 20개 후보" 컨텍스트 전달 → 진짜 경쟁사 6~8곳 선별.
   * 순수 룰 매칭이 할 수 없는 **맥락 판단** (상권, 업종 유사성, 체인점 여부)이 목적.
   */
  private async aiSelectCompetitors(
    myName: string,
    myCategory: string,
    myAddress: string,
    myVisitor: number,
    myBlog: number,
    candidates: Array<{
      name: string;
      placeId?: string;
      category?: string;
      address?: string;
      visitorReviewCount?: number;
      blogReviewCount?: number;
    }>,
  ): Promise<typeof candidates> {
    if (candidates.length === 0) return [];

    const candidateList = candidates
      .map((c, i) =>
        `${i + 1}. ${c.name} | 업종: ${c.category || "-"} | 주소: ${c.address || "-"} | 방문자리뷰: ${c.visitorReviewCount ?? "?"} | 블로그리뷰: ${c.blogReviewCount ?? "?"}`,
      )
      .join("\n");

    const systemPrompt = `당신은 자영업 마케팅 분석 전문가. 내 매장의 "진짜 경쟁자"를 선별합니다.

진짜 경쟁자 기준:
1. **같은 상권** — 내 매장과 같은 동/역/구에 있는 매장 우선
2. **같은 업종 / 유사 업종** — 소비자가 대체재로 고려할 매장 (예: 아귀찜 ↔ 해물찜 ↔ 한식요리)
3. **내 매장보다 규모가 크거나 비슷** — 방문자/블로그 리뷰 수가 내 매장 이상 (추격 목표로서 가치)
4. **실제 운영 중** — 리뷰가 전혀 없거나 극소수인 매장은 제외
5. **내 매장의 분점/체인 제외** — 같은 브랜드는 경쟁자가 아님

응답 형식 (JSON만):
{"competitors": [{"index": 숫자, "reason": "선별 이유 한 줄"}]}

총 6~8개 선별. 후보가 부족하면 적게 반환해도 됨. 후보 번호는 1부터 시작.`;

    const userPrompt = `내 매장:
- 이름: ${myName}
- 업종: ${myCategory || "-"}
- 주소: ${myAddress || "-"}
- 방문자 리뷰: ${myVisitor}
- 블로그 리뷰: ${myBlog}

경쟁사 후보 ${candidates.length}개:
${candidateList}

위 기준으로 "진짜 경쟁자" 6~8개를 선별해 JSON으로 응답.`;

    try {
      const response = await this.ai.analyze(systemPrompt, userPrompt);
      const match = response.content.match(/\{[\s\S]*\}/);
      if (!match) {
        this.logger.warn(`AI 경쟁사 선별 응답에 JSON 없음: ${response.content.slice(0, 200)}`);
      } else {
        const parsed = JSON.parse(match[0]);
        const selected: typeof candidates = [];
        const seen = new Set<number>();
        for (const item of parsed.competitors ?? []) {
          const idx = Number(item.index) - 1;
          if (seen.has(idx) || idx < 0 || idx >= candidates.length) continue;
          seen.add(idx);
          selected.push(candidates[idx]);
        }
        if (selected.length >= 2) {
          this.logger.log(`AI 경쟁사 선별 [${response.provider}]: ${selected.length}개`);
          return selected.slice(0, 8);
        }
        this.logger.warn(`AI 경쟁사 선별 결과 ${selected.length}개 — 폴백 사용`);
      }
    } catch (e: any) {
      this.logger.warn(`AI 경쟁사 선별 실패: ${e.message} — 폴백 사용`);
    }

    // 폴백 1: 내 매장보다 리뷰 많은 매장 우선
    const better = [...candidates]
      .filter(
        (c) =>
          (c.visitorReviewCount ?? 0) >= myVisitor * 0.8 ||
          (c.blogReviewCount ?? 0) >= myBlog * 0.8,
      )
      .sort(
        (a, b) =>
          ((b.visitorReviewCount ?? 0) + (b.blogReviewCount ?? 0)) -
          ((a.visitorReviewCount ?? 0) + (a.blogReviewCount ?? 0)),
      );
    if (better.length >= 3) return better.slice(0, 8);

    // 폴백 2 (완화): 리뷰 수 무관 상위 8개 — 최소한 경쟁사가 있어야 나머지 기능 동작
    const any = [...candidates].sort(
      (a, b) =>
        ((b.visitorReviewCount ?? 0) + (b.blogReviewCount ?? 0)) -
        ((a.visitorReviewCount ?? 0) + (a.blogReviewCount ?? 0)),
    );
    this.logger.log(`경쟁사 완화 폴백: ${any.length}개 중 상위 8개 사용`);
    return any.slice(0, 8);
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
