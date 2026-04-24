import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../naver/naver-searchad.provider";
import { NaverSearchProvider } from "../naver/naver-search.provider";
import { NaverPlaceProvider } from "../naver/naver-place.provider";
import { NaverRankCheckerProvider } from "../naver/naver-rank-checker.provider";
import { AIProvider } from "../ai/ai.provider";
import { KeywordDiscoveryService } from "../../modules/keyword/keyword-discovery.service";
import { RankCheckService } from "../../modules/keyword/rank-check.service";
import { AnalysisService } from "../../modules/analysis/analysis.service";
import { BriefingService } from "../../modules/briefing/briefing.service";
import { DailySnapshotJob } from "../../jobs/daily-snapshot.job";
import { CompetitorBackfillService } from "../../modules/competitor/competitor-backfill.service";
import { EventCollectorService } from "./event-collector.service";
import { KAMIS_CATALOG, KAMIS_ALL_ITEMS, isKamisRegistered } from "../../modules/ingredient/kamis-catalog";

@Injectable()
export class StoreSetupService {
  private readonly logger = new Logger(StoreSetupService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private naverSearch: NaverSearchProvider,
    private naverPlace: NaverPlaceProvider,
    private rankChecker: NaverRankCheckerProvider,
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
    private eventCollector: EventCollectorService,
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
  /**
   * 기존 경쟁사 전부 삭제하고 현재 키워드 기준으로 재선별.
   * 셋업 로직이 개선됐거나 매장 정보가 업데이트됐을 때 수동 재실행용.
   */
  async rediscoverCompetitors(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new Error("매장 없음");

    // 기존 AUTO 경쟁사 삭제 (참조 테이블 순차 정리)
    const existing = await this.prisma.competitor.findMany({
      where: { storeId, type: "AUTO" },
      select: { id: true, competitorPlaceId: true },
    });
    const compIds = existing.map((c) => c.id);
    const compPlaceIds = existing.map((c) => c.competitorPlaceId).filter((x): x is string => !!x);
    if (compIds.length > 0) {
      await this.prisma.competitorHistory.deleteMany({ where: { competitorId: { in: compIds } } });
      // CompetitorAlert 는 storeId 기준 전체 삭제 (재탐색 시 구 알림 그대로 두면 혼란)
      await this.prisma.competitorAlert.deleteMany({ where: { storeId } });
      if (compPlaceIds.length > 0) {
        await this.prisma.competitorDailySnapshot.deleteMany({
          where: { storeId, competitorPlaceId: { in: compPlaceIds } },
        });
      }
      await this.prisma.competitor.deleteMany({ where: { id: { in: compIds } } });
      this.logger.log(`[재탐색] 기존 AUTO 경쟁사 ${compIds.length}개 삭제`);
    }

    // 쿼리 선정 — MAIN(EXPOSURE용) + secondary(DIRECT용) 분리
    const queryPlan = await this.pickCompetitorQueries(storeId, store.category || "", {
      district: store.district,
      address: store.address,
      name: store.name,
    });
    if (!queryPlan.main && queryPlan.secondary.length === 0) {
      throw new Error("키워드 없음 — 재탐색 불가 (MAIN + secondary 모두 비어있음)");
    }
    this.logger.log(
      `[재탐색] MAIN: "${queryPlan.main ?? "없음"}" / secondary: ${queryPlan.secondary.join(" / ")}`,
    );

    // Place API 부가 정보
    const placeInfo = store.naverPlaceId
      ? await this.naverPlace.getPlaceDetail(store.naverPlaceId).catch(() => null)
      : null;

    await this.findCompetitorsByQueries(
      storeId,
      store.name,
      queryPlan,
      store.category || "",
      {
        visitorReviewCount: placeInfo?.visitorReviewCount,
        blogReviewCount: placeInfo?.blogReviewCount,
        address: placeInfo?.address || store.address,
      },
    );

    // 새 경쟁사의 과거 30일 backfill
    try {
      await this.backfillService.backfillAllCompetitors(storeId);
    } catch (e: any) {
      this.logger.warn(`재탐색 backfill 실패: ${e.message}`);
    }

    const newCount = await this.prisma.competitor.count({ where: { storeId } });
    return { ok: true, queryPlan, count: newCount };
  }

  /**
   * 경쟁사 탐색용 쿼리 선정 — MAIN 키워드 무조건 첫 쿼리 보장 + 보조 쿼리 2~5개.
   *
   * 2026-04-24 재설계:
   *  - MAIN 키워드(대표 키워드)는 검색량 0/null 여부와 무관하게 **반드시 첫 쿼리**
   *  - 검색광고 API 실패/지연 상황에서도 경쟁사 탐색이 반드시 성공하게 보장
   *  - 보조 쿼리는 기존 로직(narrow/medium/city 메뉴 결합)
   */
  private async pickCompetitorQueries(
    storeId: string,
    category: string,
    storeMeta?: { district?: string | null; address?: string | null; name?: string | null },
  ): Promise<{ main: string | null; secondary: string[] }> {
    // MAIN 키워드 조회 — 검색량 조건 없음 (대표 키워드는 무조건 쿼리)
    const mainKeyword = await this.prisma.storeKeyword.findFirst({
      where: { storeId, type: "MAIN" },
      select: { keyword: true },
    });
    // AI_RECOMMENDED 중 볼륨 있는 것 — 보조 쿼리용
    const topKeywords = await this.prisma.storeKeyword.findMany({
      where: {
        storeId,
        type: "AI_RECOMMENDED",
        monthlySearchVolume: { gt: 0 },
      },
      orderBy: { monthlySearchVolume: "desc" },
      take: 10,
      select: { keyword: true },
    });

    // 메뉴 토큰 (예: "한식>아귀찜,해물찜" → ["아귀찜","아구찜","해물찜"])
    const rawTokens = category
      .split(/[>,]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && !["음식점", "한식", "양식", "일식", "중식"].includes(s));
    const menuTokens = new Set<string>();
    for (const t of rawTokens) {
      menuTokens.add(t);
      if (t.includes("아귀")) menuTokens.add(t.replace("아귀", "아구"));
      if (t.includes("아구")) menuTokens.add(t.replace("아구", "아귀"));
    }
    const menuArr = [...menuTokens];
    const hasMenuToken = (kw: string) => menuArr.some((t) => kw.includes(t));

    // secondary 쿼리 — 메뉴 키워드 조합 (업종 필터 ON 대상, DIRECT 레이어)
    const secondary: string[] = [];
    const addSecondary = (q: string) => {
      const clean = q.replace(/,/g, "").replace(/\s+/g, " ").trim();
      if (clean && clean !== mainKeyword?.keyword && !secondary.includes(clean)) {
        secondary.push(clean);
      }
    };

    // 1) narrow — 내 키워드 중 "메뉴 토큰 + 지역" (예: 공덕 아구찜) max 3개
    let narrowCount = 0;
    for (const k of topKeywords) {
      if (narrowCount >= 3) break;
      if (hasMenuToken(k.keyword) && k.keyword.includes(" ")) {
        addSecondary(k.keyword);
        narrowCount++;
      }
    }

    // 2) medium — district + 메뉴 합성 (예: 마포 아구찜) max 2개
    //    narrow 로 상권 내 경쟁사 확보 + medium 으로 같은 업종 인근 확보
    const districtToken =
      (storeMeta?.district || "")
        .split(/\s+/)
        .map((p) => p.replace(/(구|시|군)$/, ""))
        .find((t) => t.length >= 2) ||
      (storeMeta?.address || "")
        .split(/\s+/)
        .map((p) => p.replace(/(구|시|군|도|동|읍|면)$/, ""))
        .find((t) => t.length >= 2);
    if (districtToken && menuArr.length > 0) {
      let mediumCount = 0;
      for (const menu of menuArr) {
        if (mediumCount >= 2) break;
        addSecondary(`${districtToken} ${menu}`);
        mediumCount++;
      }
    }

    // 3) 메뉴 단독 (같은 업종 전국 노출 매장 — 벤치마크) max 1개
    for (const k of topKeywords) {
      if (hasMenuToken(k.keyword) && !k.keyword.includes(" ")) {
        addSecondary(k.keyword);
        break;
      }
    }

    // 4) 여전히 부족하면 city + 메뉴 (예: 서울 아구찜)
    if (secondary.length < 2 && menuArr.length > 0) {
      const cityToken = (storeMeta?.address || "")
        .split(/\s+/)
        .map((p) => p.replace(/(특별시|광역시|시|도)$/, ""))
        .find((t) => /^(서울|부산|대구|인천|광주|대전|울산|경기|충북|충남|전북|전남|경북|경남|제주|강원)$/.test(t));
      if (cityToken) {
        for (const menu of menuArr) {
          if (secondary.length >= 3) break;
          addSecondary(`${cityToken} ${menu}`);
        }
      }
    }

    return { main: mainKeyword?.keyword || null, secondary: secondary.slice(0, 5) };
  }

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
              mapx: placeInfo.mapx ? Number(placeInfo.mapx) : undefined,
              mapy: placeInfo.mapy ? Number(placeInfo.mapy) : undefined,
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
      const aiResult = await this.generateSmartKeywords(
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
      const keywords = aiResult.keywords.filter((k) => !excludedSet.has(k));
      // 10개 미만 cap (의뢰자 2026-04-24 요청) — primaryKeyword 는 반드시 포함시킨 뒤 자르기
      const KEYWORD_CAP = 9;
      let cappedKeywords = keywords;
      if (keywords.length > KEYWORD_CAP) {
        const withPrimary = keywords.includes(aiResult.primaryKeyword)
          ? [aiResult.primaryKeyword, ...keywords.filter((k) => k !== aiResult.primaryKeyword)]
          : [aiResult.primaryKeyword, ...keywords];
        cappedKeywords = withPrimary.slice(0, KEYWORD_CAP);
      }
      // primaryKeyword 가 excludedSet 에 걸려 사라진 경우 — 대표 키워드는 예외로 보호 (사용자가 매장 대표로 쓸 키워드)
      if (!cappedKeywords.includes(aiResult.primaryKeyword) && aiResult.primaryKeyword) {
        cappedKeywords = [aiResult.primaryKeyword, ...cappedKeywords].slice(0, KEYWORD_CAP);
      }
      this.logger.log(
        `AI 키워드 ${cappedKeywords.length}개 확정 (대표: ${aiResult.primaryKeyword}): ${cappedKeywords.join(", ")}`,
      );

      // fail-fast: 키워드 2개 미만이면 가입 실패 처리 (저볼륨 필터가 남기는 최소 1~2개 허용)
      if (cappedKeywords.length < 2) {
        throw new Error(
          `키워드 생성 실패 — ${cappedKeywords.length}개만 생성됨 (최소 2개 필요). 네이버 Place 주소/카테고리 파싱을 확인하세요.`,
        );
      }

      // 1) 키워드 일괄 저장 — primaryKeyword 는 type:MAIN, 나머지는 AI_RECOMMENDED
      const createdKeywords: Array<{ id: string; keyword: string }> = [];
      for (const kw of cappedKeywords) {
        const kwType = kw === aiResult.primaryKeyword ? "MAIN" : "AI_RECOMMENDED";
        try {
          const created = await this.prisma.storeKeyword.create({
            data: {
              storeId,
              keyword: kw,
              type: kwType,
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
      // MAIN 키워드는 저볼륨 필터에서 절대 삭제 금지 (대표 키워드는 검색량과 무관하게 매장 정체성)
      const lowVolume = await this.prisma.storeKeyword.findMany({
        where: {
          storeId,
          type: "AI_RECOMMENDED",
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

      // 3단계: 경쟁매장 탐색 — 사용자 의도: "내 대표 키워드들(검색량 top)로 검색 시 공통 노출 업체"
      await this.updateSetupStatus(storeId, "RUNNING", "경쟁 매장을 찾는 중...");
      const updatedStore = await this.prisma.store.findUnique({ where: { id: storeId } });
      const finalDistrict = updatedStore?.district || district;
      const finalCategory = updatedStore?.category || category;

      const competitorQueryPlan = await this.pickCompetitorQueries(storeId, finalCategory || "", {
        district: finalDistrict,
        address: placeInfo?.address || store.address,
        name: store.name,
      });

      // MAIN 누락 + secondary 부족 시 지역+메뉴 폴백으로 보강 (초기 가입 실패 방지)
      // MAIN 이 비어있으면 fallbackMain 으로 대체 (사용자는 대표 키워드가 반드시 있어야 EXPOSURE 수집 가능)
      if (!competitorQueryPlan.main || competitorQueryPlan.secondary.length < 2) {
        const fallbackRegion =
          finalDistrict?.split(/\s+/).pop()?.replace(/(구|시|군|동|읍|면)$/, "") ||
          (placeInfo?.address || "").split(/\s+/).filter(Boolean).slice(-2, -1)[0]?.replace(/(구|시|군|동|읍|면)$/, "") ||
          "";
        const fallbackMenu = (finalCategory ?? "")
          .split(/[>,]/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length >= 2 && s.length <= 6 && !["음식점", "한식"].includes(s))[0];
        if (fallbackRegion) {
          if (!competitorQueryPlan.main) {
            competitorQueryPlan.main = `${fallbackRegion} 맛집`.replace(/,/g, "");
          }
          if (fallbackMenu && competitorQueryPlan.secondary.length < 2) {
            const menuQuery = `${fallbackRegion} ${fallbackMenu}`.replace(/,/g, "");
            if (!competitorQueryPlan.secondary.includes(menuQuery) && menuQuery !== competitorQueryPlan.main) {
              competitorQueryPlan.secondary.push(menuQuery);
            }
          }
        }
      }
      this.logger.log(
        `경쟁사 쿼리 계획 — MAIN: "${competitorQueryPlan.main ?? "없음"}" / secondary: ${competitorQueryPlan.secondary.join(" / ")}`,
      );
      await this.findCompetitorsByQueries(
        storeId,
        store.name,
        competitorQueryPlan,
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

      // 7-2.5단계: 주재료 자동 판정 (KAMIS 가격 추적 대상)
      await this.updateSetupStatus(storeId, "RUNNING", "주재료 자동 판정 중...");
      try {
        const ingredients = await this.detectKeyIngredients(store.name, finalCategory, aiResult.keywords);
        if (ingredients.length > 0) {
          await this.prisma.store.update({
            where: { id: storeId },
            data: { keyIngredients: ingredients },
          });
          this.logger.log(`주재료 ${ingredients.length}개 등록: ${ingredients.join(", ")}`);
        }
      } catch (e: any) {
        this.logger.warn(`주재료 판정 실패 (나중에 수동 설정 가능): ${e.message}`);
      }

      // 7-3단계: 주변 축제/이벤트 수집 (TourAPI) — 매장 지역 90일치
      // 축제 데이터만 SeasonalEvent 테이블에 저장. StoreKeyword 자동 삽입 금지.
      // (축제명 raw 단어를 매장 키워드로 꽂으면 "서울"/"DDP" 같은 쓰레기가 유입됨 — 2026-04-24 의뢰자 확정)
      // 사장님이 시즌 이벤트 화면에서 원하는 축제만 수동으로 키워드에 추가하는 경로만 유지.
      await this.updateSetupStatus(storeId, "RUNNING", "주변 축제/이벤트 수집 중...");
      try {
        const eventCount = await this.eventCollector.collectForStore(storeId, 90);
        this.logger.log(`축제 ${eventCount}개 수집 완료`);
      } catch (e: any) {
        this.logger.warn(`축제 수집 실패 (나중에 재시도 가능): ${e.message}`);
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
          // 좌표 — getPlaceDetail 응답에 있을 수도, 없을 수도
          mapx: (detail as any).mapx ?? (detail as any).x,
          mapy: (detail as any).mapy ?? (detail as any).y,
        };
      }
    } catch (e: any) {
      this.logger.debug(`placeId 직접 조회 실패 (${placeId}): ${e.message}`);
    }

    // 2차: 매장명으로 검색 API (local.json 은 mapx/mapy 확실히 반환)
    try {
      const places = await this.naverSearch.searchPlace(storeName, 3);
      if (places.length > 0) {
        const best = places[0];
        const jibunAddr = best.address || "";
        const roadAddr = best.roadAddress || "";
        const effectiveAddr = jibunAddr || roadAddr;
        // local.json 좌표는 KATECH 좌표계 (10^6 배 큰 값) — WGS84 변환 필요
        // 예: mapx="1269987365" → 126.9987365
        const toWgs = (v: string | number | undefined): number | null => {
          if (v == null) return null;
          const n = Number(v);
          if (!Number.isFinite(n)) return null;
          return n > 1000 ? n / 1e7 : n;
        };
        return {
          address: effectiveAddr,
          roadAddress: roadAddr,
          category: best.category || "",
          district: this.extractDistrict(effectiveAddr),
          phone: best.telephone || "",
          mapx: toWgs(best.mapx),
          mapy: toWgs(best.mapy),
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
          mapx: (info as any).mapx ?? (info as any).x,
          mapy: (info as any).mapy ?? (info as any).y,
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
  ): Promise<{ keywords: string[]; primaryKeyword: string }> {
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
    // 2026-04-24: primaryKeyword 필수 필드 추가 — 대표 키워드 1개를 AI가 명시 선정 → MAIN 타입으로 저장
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

### 3단계: **대표 키워드(primaryKeyword) 1개 명시 선정** ⭐ 필수
생성한 키워드 중 **"메뉴 미정 상태에서 이 매장을 발견할 확률이 가장 높은 키워드 1개"** 를 선택.
- 선정 기준 (우선순위):
  1. **지역+유입** (예: "공덕 맛집") — 가장 보편적 진입점. 기본값
  2. 지역+상황 (예: "강남 회식") — 회식/데이트 특화 매장
  3. 랜드마크+유입 (예: "뱅뱅사거리 맛집") — 관광지/특수상권
- **절대 메뉴 키워드 선택 금지** — 메뉴 키워드는 이미 결정한 고객용 (전환 검색)
- primaryKeyword 는 반드시 keywords 배열 안에도 존재해야 함

## 출력 형식 (JSON만, 설명 없이)

\`\`\`json
{
  "analysis": {
    "primaryRegion": "공덕",
    "primaryKeyword": "공덕 맛집",
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
  "analysis": {"primaryRegion": "강남", "primaryKeyword": "강남 맛집", "subwayStations": ["강남역"], "landmarks": ["뱅뱅사거리"]},
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
  "analysis": {"primaryRegion": "단양", "primaryKeyword": "단양 맛집", "subwayStations": null, "landmarks": ["수안보"]},
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

          // 분석 결과 로그 (primaryKeyword 포함)
          this.logger.log(
            `AI 지역 분석 [${response.provider}] — 핵심지역: ${analysis.primaryRegion}, 대표키워드: ${analysis.primaryKeyword}, 역: ${JSON.stringify(analysis.subwayStations)}, 랜드마크: ${JSON.stringify(analysis.landmarks)}`,
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
            // primaryKeyword 검증 — AI가 누락/잘못 지정 시 유입 카테고리 첫 키워드로 폴백
            let primaryKeyword = (analysis.primaryKeyword || "").trim();
            const isValidPrimary =
              primaryKeyword && cleaned.some((k) => k === primaryKeyword);
            if (!isValidPrimary) {
              // 유입 카테고리 첫 키워드 → 그것도 없으면 cleaned[0]
              const first유입 = kwEntries.find(
                (e) => e.category === "유입" && cleaned.includes(e.kw?.trim()),
              );
              primaryKeyword = first유입?.kw.trim() || cleaned[0];
              this.logger.warn(
                `AI primaryKeyword 누락/무효 → 자동 선정: "${primaryKeyword}"`,
              );
            }
            this.logger.log(
              `AI 키워드 검증 통과 (시도 ${attempt}) — 대표키워드: ${primaryKeyword} / 유입 ${byCategory["유입"] || 0} / 상황 ${byCategory["상황"] || 0} / 메뉴 ${byCategory["메뉴"] || 0}: ${cleaned.join(", ")}`,
            );
            return { keywords: cleaned, primaryKeyword };
          }
          this.logger.warn(
            `AI 키워드 검증 실패 (시도 ${attempt}) — 유입 ${byCategory["유입"] || 0} 메뉴 ${byCategory["메뉴"] || 0} 총 ${cleaned.length} — ${attempt < 2 ? "재시도" : "폴백"}`,
          );
        }
      } catch (e: any) {
        this.logger.warn(`AI 키워드 생성 실패 (시도 ${attempt}): ${e.message}`);
      }
    }

    // AI 완전 실패 시 규칙 기반 최소 폴백 (AI 없이도 셋업 성공하도록 5개 이상 보장)
    const fallback: string[] = [];
    // 지명 접미사 모두 제거 (단양읍 → 단양)
    const primaryRegion =
      brandLocationHint ||
      dong?.replace(/(동|읍|면)$/, "") ||
      gu?.replace(/구$/, "") ||
      "";
    // 대도시 여부 (역 키워드 생성 여부 판단)
    const isMetro = /특별시|광역시|서울|부산|대구|인천|광주|대전|울산|수원|성남|고양/.test(address);
    // 대표 메뉴 추출 (카테고리 원문/포괄어 제외, 세부 메뉴만)
    const safeMenus = categoryParts.filter(
      (c) =>
        !c.includes(">") &&
        c.length >= 2 &&
        c.length <= 6 &&
        !["음식점", "한식", "양식", "일식", "중식", "기타", "분식", "주점"].includes(c),
    );

    if (primaryRegion) {
      // 유입 카테고리 (최소 2개) — 첫 번째가 폴백 primaryKeyword
      fallback.push(`${primaryRegion} 맛집`);
      if (isMetro) fallback.push(`${primaryRegion}역 맛집`);
      else fallback.push(`${primaryRegion} 식당`);
      // 상황 카테고리 (최소 2개)
      fallback.push(`${primaryRegion} 회식`);
      fallback.push(`${primaryRegion} 점심`);
      // 메뉴 카테고리 (대표 메뉴 각각 1개씩)
      for (const menu of safeMenus.slice(0, 3)) {
        fallback.push(`${primaryRegion} ${menu}`);
      }
    }

    this.logger.warn(`AI 완전 실패 — 규칙 기반 폴백 ${fallback.length}개 생성`);
    const cleanedFallback = this.sanitizeKeywords(fallback, primaryRegion);
    // 폴백 primaryKeyword: 첫 유입 키워드 = "${지역} 맛집"
    const fallbackPrimary = cleanedFallback[0] || (primaryRegion ? `${primaryRegion} 맛집` : "");
    return { keywords: cleanedFallback, primaryKeyword: fallbackPrimary };
  }

  /**
   * KAMIS 등록 품목 중에서만 매장 주재료 8~12개 자동 판정.
   * 보리/흑마늘/참기름 등 KAMIS 미등록 품목은 애초에 추천되지 않음.
   */
  private async detectKeyIngredients(
    storeName: string,
    category: string,
    aiKeywords: string[],
  ): Promise<string[]> {
    if (!category) return [];

    // KAMIS 카탈로그를 프롬프트 요약 형태로
    const catalogText = Object.entries(KAMIS_CATALOG)
      .map(([cat, items]) => `- ${cat}: ${items.join(", ")}`)
      .join("\n");

    const systemPrompt = `당신은 자영업 원가 분석 전문가. **KAMIS(농수산물유통공사) 공개 가격 데이터에 실제로 존재하는 품목** 중에서만 매장 주재료 8~12개를 균형있게 선정한다.

## ⚠️ 절대 규칙 — 아래 KAMIS 등록 품목에서만 선택
아래 리스트에 **없는** 이름(예: 보리, 보리쌀, 흑마늘, 참기름, 된장, 고추장, 아귀, 미더덕, 낙지, 고사리)은 **절대 추천 금지**.

### KAMIS 등록 품목 (정확한 이름으로 사용)
${catalogText}

## 카테고리별 추천 균형
1. 주재료 2~3개 (예: 보리밥집 → 쌀/찹쌀, 아귀찜집 → 고등어/꽃게, 치킨집 → 닭, 소고기집 → 소)
2. 채소/부재료 4~5개 (예: 깐마늘(국산), 대파(→"파"), 양파, 배추, 시금치, 무, 호박, 콩나물(→"콩"), 깻잎, 미나리)
3. 양념/조미료 1~2개 — **KAMIS에 있는 것만** (참깨, 건고추, 고춧가루, 붉은고추)
   ※ 고추장/된장/간장/참기름은 KAMIS 미등록이므로 사용 금지
4. 특수재료 1~2개 (예: 축산물에서 소/돼지/계란/닭, 수산물에서 해당 업종 어류)

## 규칙
- 반드시 위 카탈로그의 **정확한 이름** 사용 (예: "마늘" 대신 "깐마늘(국산)", "파" 대신 "파")
- 업종과 무관한 재료 제외 (한식당에 과일/아보카도 금지)
- 총 **8~12개**

## 출력 (JSON 배열만, 설명 없이)
["재료1", "재료2", ...]

## 예시 — 보리밥/한정식 매장
["쌀", "찹쌀", "배추", "시금치", "무", "양파", "깐마늘(국산)", "호박", "돼지", "계란", "고춧가루", "느타리버섯"]

## 예시 — 아귀찜/해물찜
["조기", "꽃게", "홍합", "새우", "콩", "무", "양파", "미나리", "고춧가루", "깐마늘(국산)", "파"]

## 예시 — 소고기 구이집
["소", "깻잎", "상추", "파", "양파", "깐마늘(국산)", "배", "호박"]

## 예시 — 치킨집
["닭", "양파", "깐마늘(국산)", "파", "고춧가루", "파프리카", "계란", "호박"]`;

    const userPrompt = `매장 정보:
- 매장명: ${storeName}
- 카테고리: ${category}
- 주요 키워드 (대표 메뉴 힌트): ${aiKeywords.slice(0, 10).join(", ")}

위 KAMIS 카탈로그 품목 중 이 매장의 원가 관리에 의미 있는 **8~12개**를 JSON 배열로 응답.
카탈로그에 없는 이름 (보리/흑마늘/참기름/된장/고추장/아귀/미더덕/낙지)은 절대 사용 금지.`;

    try {
      const response = await this.ai.analyze(systemPrompt, userPrompt);
      const match = response.content.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      const cleaned = (parsed as any[])
        .filter((k) => typeof k === "string")
        .map((k: string) => k.trim())
        .filter((k: string) => k.length >= 2 && k.length <= 20)
        // KAMIS 미등록 품목 자동 제거 (AI가 실수로 넣어도 걸러냄)
        .filter((k: string) => isKamisRegistered(k));
      const unique = [...new Set(cleaned)];
      this.logger.log(`AI KAMIS 재료 판정 [${response.provider}] ${unique.length}개: ${unique.join(", ")}`);
      return unique.slice(0, 12);
    } catch (e: any) {
      this.logger.warn(`AI 주재료 판정 실패: ${e.message}`);
      return [];
    }
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
  /**
   * 2026-04-24 근본 재설계 — 경쟁사 수집:
   *  - 소스: `rankChecker.fetchTopPlaces` (네이버 플레이스 HTML 검색 Top)
   *         → `naverSearch.searchPlace` (지역 OpenAPI sort=comment) 금지.
   *           단순 리뷰많은순이라 "신길 맛집" 에 스타벅스/맥도날드/버거킹 뜨는 참사
   *  - 필터: 음식점만 (카페/디저트/패스트푸드/주점/편의점 제외) — 의뢰자 명시 확정
   *  - EXPOSURE: MAIN 키워드(예: "신길 맛집") Top 중 음식점만
   *  - DIRECT:   secondary(메뉴+지역) Top 중 음식점만 + AI 선별
   */
  private async findCompetitorsByQueries(
    storeId: string,
    storeName: string,
    queryPlan: { main: string | null; secondary: string[] },
    category: string,
    myStore?: { visitorReviewCount?: number | null; blogReviewCount?: number | null; address?: string | null },
  ) {
    const normalizedStoreName = storeName.replace(/\s+/g, "");
    type Candidate = {
      name: string;
      placeId?: string;
      category?: string;
      address?: string;
      visitorReviewCount?: number;
      blogReviewCount?: number;
      appearances: number;
      queryMatches: string[];
    };

    const isSelf = (normalized: string, name: string): boolean => {
      if (normalized === normalizedStoreName) return true;
      if (normalized.includes(normalizedStoreName)) return true;
      if (normalizedStoreName.includes(normalized)) return true;
      if (name.length < 2) return true;
      if (/^\d+$/.test(name)) return true;
      return false;
    };

    // ========== Stage 1: EXPOSURE 수집 (MAIN 키워드 플레이스 HTML Top 20) ==========
    // 음식점 필터는 Stage 3 Place API 카테고리 보강 후 적용
    const exposureNames = new Set<string>();
    const exposureCandidates: Candidate[] = [];
    if (queryPlan.main) {
      this.logger.log(`[EXPOSURE 수집] "${queryPlan.main}" 플레이스 HTML Top 20`);
      try {
        const results = await this.rankChecker.fetchTopPlaces(queryPlan.main, 20);
        for (const r of results) {
          const normalized = r.name.replace(/\s+/g, "");
          if (isSelf(normalized, r.name)) continue;
          if (exposureNames.has(normalized)) continue;
          exposureNames.add(normalized);
          exposureCandidates.push({
            name: r.name,
            placeId: r.id || undefined,
            appearances: 1,
            queryMatches: [queryPlan.main],
          });
        }
        this.logger.log(`[EXPOSURE] ${exposureCandidates.length}곳 수집 (필터 전)`);
      } catch (e: any) {
        this.logger.warn(`[EXPOSURE] 수집 실패 "${queryPlan.main}": ${e.message}`);
      }
    } else {
      this.logger.warn(`[EXPOSURE] MAIN 키워드 없음 — skip`);
    }

    // ========== Stage 2: DIRECT 후보 수집 (secondary 쿼리 플레이스 HTML) ==========
    const directCandMap = new Map<string, Candidate>();
    for (const query of queryPlan.secondary) {
      try {
        this.logger.log(`[DIRECT 후보 수집] "${query}" 플레이스 HTML Top 15`);
        const results = await this.rankChecker.fetchTopPlaces(query, 15);
        for (const r of results) {
          const normalized = r.name.replace(/\s+/g, "");
          if (isSelf(normalized, r.name)) continue;
          const existing = directCandMap.get(normalized);
          if (existing) {
            existing.appearances += 1;
            if (!existing.queryMatches.includes(query)) existing.queryMatches.push(query);
          } else {
            directCandMap.set(normalized, {
              name: r.name,
              placeId: r.id || undefined,
              appearances: 1,
              queryMatches: [query],
            });
          }
        }
      } catch (e: any) {
        this.logger.warn(`[DIRECT] 수집 실패 [${query}]: ${e.message}`);
      }
    }
    const directCandidates = Array.from(directCandMap.values()).sort(
      (a, b) => b.appearances - a.appearances,
    );
    this.logger.log(
      `[DIRECT] 후보 ${directCandidates.length}개 (필터 전) — 교집합(≥2) ${directCandidates.filter((c) => c.appearances >= 2).length}개`,
    );

    // 조기 종료 — EXPOSURE + DIRECT 후보 모두 0이면 더 진행 불가
    if (exposureCandidates.length === 0 && directCandidates.length === 0) {
      this.logger.warn(`[경쟁사] 후보 0개 — 네이버 검색 완전 실패`);
      return;
    }

    // ========== Stage 3: Place API 보강 (EXPOSURE + DIRECT 합쳐서 중복 제거) ==========
    const allCandidatesMap = new Map<string, Candidate>();
    for (const c of exposureCandidates) {
      allCandidatesMap.set(c.name.replace(/\s+/g, ""), c);
    }
    // DIRECT 후보는 상위 20개까지만 보강 (API 호출 제한)
    for (const c of directCandidates.slice(0, 20)) {
      const key = c.name.replace(/\s+/g, "");
      if (!allCandidatesMap.has(key)) {
        allCandidatesMap.set(key, c);
      }
    }
    const allCandidates = Array.from(allCandidatesMap.values());
    const enrichedRaw: Candidate[] = [];
    for (const c of allCandidates) {
      try {
        // placeId 가 이미 있으면 getPlaceDetail, 없으면 이름 검색 후 상세
        const info = c.placeId
          ? await this.naverPlace.getPlaceDetail(c.placeId)
          : await this.naverPlace.searchAndGetPlaceInfo(c.name);
        if (info) {
          enrichedRaw.push({
            ...c,
            placeId: info.id,
            category: info.category || c.category,
            address: info.roadAddress || info.address || c.address,
            visitorReviewCount: info.visitorReviewCount,
            blogReviewCount: info.blogReviewCount,
          });
        } else {
          enrichedRaw.push(c);
        }
      } catch {
        enrichedRaw.push(c);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // ========== Stage 3.5: 음식점 필터 (카페/패스트푸드/주점/편의점 제외) ==========
    // 의뢰자 명시 확정 (2026-04-24): "스타벅스가 경쟁 상대냐. 영등포 맛집/신길 맛집 검색해서 나오는 음식점만"
    const myIsBunsik = /분식/.test(category); // 내 매장이 분식이면 분식 경쟁 허용
    const isRestaurantCategory = (cat: string | undefined): boolean => {
      if (!cat) return false; // 카테고리 모르면 제외 (보수적)
      // 제외 (경쟁 아님): 카페/디저트/패스트푸드/주점/편의점/기타
      if (/카페|디저트|베이커리|빵집|빙수|아이스크림|도넛|와플|케이크|쥬스|주스/.test(cat)) return false;
      if (/햄버거|피자|치킨|패스트푸드|프라이드/.test(cat)) return false;
      if (/주점|술집|호프|맥주|와인바|위스키|칵테일|바\(bar\)|바&|이자카야/.test(cat)) return false;
      if (/편의점|마트|슈퍼|정육점|반찬가게|반찬|도시락/.test(cat)) return false;
      if (/노래|pc방|찜질|사우나|게임|카라오케/.test(cat)) return false;
      // 분식은 내 매장이 분식일 때만 포함
      if (/분식/.test(cat) && !myIsBunsik) return false;
      // 포함 (음식점): 한식/양식/일식/중식/아시안/뷔페 등
      return true;
    };

    const enriched = enrichedRaw.filter((c) => {
      const ok = isRestaurantCategory(c.category);
      if (!ok) {
        this.logger.log(`[음식점 필터] 제외: ${c.name} (업종: ${c.category || "미상"})`);
      }
      return ok;
    });
    this.logger.log(
      `[음식점 필터] ${enrichedRaw.length}곳 → ${enriched.length}곳 (제외 ${enrichedRaw.length - enriched.length})`,
    );

    // ========== Stage 4: DIRECT 만 AI 선별 ==========
    const directOnly = enriched.filter((c) => {
      const key = c.name.replace(/\s+/g, "");
      return directCandMap.has(key);
    });
    const directSelected = directOnly.length > 0
      ? await this.aiSelectCompetitors(
          storeName,
          category,
          myStore?.address || "",
          myStore?.visitorReviewCount ?? 0,
          myStore?.blogReviewCount ?? 0,
          directOnly,
        )
      : [];
    this.logger.log(
      `[DIRECT] AI 선별 ${directSelected.length}곳: ${directSelected.map((c) => c.name).join(", ")}`,
    );

    // ========== Stage 5: 저장 — EXPOSURE / DIRECT / BOTH 분류 (음식점만) ==========
    const enrichedKeys = new Set(enriched.map((c) => c.name.replace(/\s+/g, "")));
    const exposureKeys = new Set(
      exposureCandidates
        .map((c) => c.name.replace(/\s+/g, ""))
        .filter((k) => enrichedKeys.has(k)), // 음식점 필터 통과한 것만
    );
    const directSelectedKeys = new Set(directSelected.map((c) => c.name.replace(/\s+/g, "")));

    // 저장 대상: exposureCandidates 전체 + directSelected 전체 (중복 제거)
    const toSave = new Map<string, Candidate>();
    for (const c of enriched) {
      const key = c.name.replace(/\s+/g, "");
      const inExposure = exposureKeys.has(key);
      const inDirect = directSelectedKeys.has(key);
      if (inExposure || inDirect) {
        toSave.set(key, c);
      }
    }

    let savedExposure = 0, savedDirect = 0, savedBoth = 0;
    for (const c of toSave.values()) {
      const key = c.name.replace(/\s+/g, "");
      const inExposure = exposureKeys.has(key);
      const inDirect = directSelectedKeys.has(key);
      const competitionType: "EXPOSURE" | "DIRECT" | "BOTH" =
        inExposure && inDirect ? "BOTH" : inExposure ? "EXPOSURE" : "DIRECT";

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
            competitionType,
            receiptReviewCount: c.visitorReviewCount || undefined,
            blogReviewCount: c.blogReviewCount || undefined,
            dailySearchVolume: dailySearch,
            lastComparedAt: new Date(),
          },
        });
        if (competitionType === "BOTH") savedBoth++;
        else if (competitionType === "EXPOSURE") savedExposure++;
        else savedDirect++;
      } catch (e: any) {
        this.logger.warn(`경쟁사 저장 실패 [${c.name}]: ${e.message}`);
      }
    }
    this.logger.log(
      `[경쟁사 저장 완료] EXPOSURE ${savedExposure} / DIRECT ${savedDirect} / BOTH ${savedBoth} (총 ${savedExposure + savedDirect + savedBoth})`,
    );
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
      appearances?: number;
      queryMatches?: string[];
    }>,
  ): Promise<typeof candidates> {
    if (candidates.length === 0) return [];

    const candidateList = candidates
      .map((c, i) => {
        const hits = c.appearances ?? 1;
        const queries = c.queryMatches?.join(", ") || "-";
        return `${i + 1}. ${c.name} | 업종: ${c.category || "-"} | 주소: ${c.address || "-"} | 방문자리뷰: ${c.visitorReviewCount ?? "?"} | 블로그리뷰: ${c.blogReviewCount ?? "?"} | 공통등장: ${hits}회 (${queries})`;
      })
      .join("\n");

    // 내 매장의 "세부 업종" 토큰 추출 (예: "한식>아귀찜,해물찜" → [아귀찜, 해물찜])
    const myDetailCategories = (myCategory || "")
      .split(/[>,]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && !["음식점", "한식", "양식", "일식", "중식"].includes(s));
    const myDetailStr = myDetailCategories.length > 0 ? myDetailCategories.join(", ") : myCategory;

    const systemPrompt = `당신은 자영업 마케팅 분석 전문가. 내 매장의 "진짜 경쟁자"를 선별합니다.

## 진짜 경쟁자 기준 (엄격)
1. **세부 업종 일치 최우선** — "같은 대분류(한식)"만으로는 경쟁자 아님. 실제로 같거나 아주 가까운 세부 메뉴여야 함.
   ✓ 내가 "아귀찜,해물찜" → 아귀찜, 해물찜, 해물탕, 찜류, 매운탕 O.K.
   ❌ 곱창/삼겹살/냉면/돈까스/초밥/디저트/카페 — 같은 한식이라도 다른 수요, 선별 금지.
2. **같은 상권** — 같은 동/역/구 우선. 상권 다르면 후순위.
3. **공통 등장 가중치** — 각 후보 끝의 "공통등장: N회" 는 서로 다른 검색 키워드에 몇 번 노출됐는지. 2회 이상 = 진짜 경쟁자 신호로 강하게 가중.
4. **실제 운영 중** — 방문자/블로그 리뷰 합 30건 미만은 제외.
5. **내 매장 규모 이상 또는 그에 준함** — 추격/참고 가치.
6. **내 매장의 분점/체인 제외**.

## 출력
JSON 만. 설명 없음.
{"competitors": [{"index": 숫자, "reason": "한 줄 이유 (업종일치/공통등장/상권)"}]}

6~8개 선별. 세부 업종 일치가 부족하면 적게 반환 (3~5개도 OK). 업종 다른 매장 억지로 채우지 말 것.`;

    const userPrompt = `내 매장:
- 이름: ${myName}
- 전체 업종: ${myCategory || "-"}
- **세부 업종(경쟁 판단 기준)**: ${myDetailStr}
- 주소: ${myAddress || "-"}
- 방문자 리뷰: ${myVisitor}
- 블로그 리뷰: ${myBlog}

경쟁사 후보 ${candidates.length}개 (공통등장 많은 순):
${candidateList}

위 기준으로 "세부 업종 일치" + "공통등장 ≥2" 를 최우선으로 6~8개 선별. JSON만.`;

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

    // 폴백 스코어링 — AI 실패 시에도 업종/공통등장 기반으로 그럴듯한 선별
    const myDetailSet = new Set(
      (myCategory || "")
        .split(/[>,]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && !["음식점", "한식", "양식", "일식", "중식"].includes(s)),
    );
    const categoryMatches = (c: (typeof candidates)[number]) => {
      if (!c.category) return 0;
      const tokens = c.category.split(/[>,]/).map((s) => s.trim());
      let hit = 0;
      for (const t of tokens) {
        if (myDetailSet.has(t)) hit += 2; // 세부 업종 완전 일치 가중치 큼
        else if ([...myDetailSet].some((my) => t.includes(my) || my.includes(t))) hit += 1;
      }
      return hit;
    };
    const score = (c: (typeof candidates)[number]) =>
      (c.appearances ?? 1) * 10 +              // 공통 등장 가중치 최대
      categoryMatches(c) * 5 +                   // 세부 업종 일치
      Math.min(5, (c.visitorReviewCount ?? 0) / 500) + // 리뷰 스케일 (상한)
      Math.min(5, (c.blogReviewCount ?? 0) / 500);

    const scored = [...candidates].sort((a, b) => score(b) - score(a));

    // 업종 일치가 있는 후보 우선, 부족하면 교집합 높은 것으로 채움
    const withMatch = scored.filter((c) => categoryMatches(c) > 0);
    const picked = withMatch.length >= 3 ? withMatch.slice(0, 8) : scored.slice(0, 8);
    this.logger.log(
      `경쟁사 폴백(스코어): ${picked.length}개 — ${picked.map((c) => `${c.name}(${c.appearances ?? 1}회)`).join(", ")}`,
    );
    return picked;
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
