import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { CacheService } from "../../common/cache.service";
import * as crypto from "crypto";

/**
 * 마케팅 로직 엔진
 *
 * 의뢰자 요구사항:
 * 1. 기본 체력 판단: 리뷰 수 기준 우선순위
 * 2. 트래픽 판단: 리뷰 있는데 검색 유입 없는 경우
 * 3. 업종별 키워드 전략 분기
 * 4. 종합 → 오늘의 액션 3가지 자동 생성
 */

export interface MarketingDiagnosis {
  phase: "REVIEW_FIRST" | "TRAFFIC_NEEDED" | "OPTIMIZATION" | "MAINTENANCE";
  phaseLabel: string;
  phaseDescription: string;
  problems: Problem[];
  actions: Action[];
  keywordStrategy: KeywordStrategy | null;
  aiPending?: boolean; // AI 보강 백그라운드 진행 중 (프론트 재조회 힌트)
}

export interface Problem {
  type: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  metric?: { current: number; target: number; unit: string };
}

export interface Action {
  type: string;
  title: string;
  description: string;
  reason: string;
  href: string;
  priority: number;
  // 신규: 구체적 가이드
  steps?: string[];           // 단계별 실행 방법
  expectedEffect?: string;    // 예상 효과 (예: "리뷰 5개 = 순위 +3위 추정")
  metric?: {                  // 측정 가능한 지표
    current: number;
    target: number;
    unit: string;
  };
}

export interface KeywordStrategy {
  industry: string;
  focusKeywords: string[];
  dropKeywords: string[];
  recommendation: string;
}

@Injectable()
export class MarketingEngineService {
  private readonly logger = new Logger(MarketingEngineService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
    private cache: CacheService,
  ) {}

  async diagnose(storeId: string, preloadedStore?: any): Promise<MarketingDiagnosis> {
    const store = preloadedStore ?? await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: { orderBy: { monthlySearchVolume: "desc" } },
        competitors: { orderBy: { receiptReviewCount: "desc" } },
      },
    });
    if (!store) throw new Error("Store not found");

    const analysis = store.analyses[0] || null;
    const keywords: any[] = store.keywords ?? [];
    const competitors: any[] = store.competitors ?? [];

    const myReceiptReviews = analysis?.receiptReviewCount ?? 0;
    const myBlogReviews = analysis?.blogReviewCount ?? 0;
    const mySaveCount = analysis?.saveCount ?? 0;

    const avgCompReviews = this.avg(competitors, "receiptReviewCount");
    const avgCompBlogs = this.avg(competitors, "blogReviewCount");

    const rankedKws = keywords.filter((k) => k.currentRank != null);
    const avgRank = rankedKws.length > 0
      ? Math.round(rankedKws.reduce((s, k) => s + (k.currentRank ?? 0), 0) / rankedKws.length)
      : null;

    // === 1. 마케팅 단계 판단 ===
    const phase = this.determinePhase(myReceiptReviews, avgRank, myBlogReviews, avgCompBlogs);

    // === 2. 문제 진단 ===
    const problems = this.diagnoseProblems(
      myReceiptReviews, myBlogReviews, mySaveCount,
      avgCompReviews, avgCompBlogs,
      avgRank, rankedKws.length, keywords.length,
    );

    // === 2-2. 추가 진단: 키워드 검색량 0, 1위와 격차, 역전 위협 ===
    // 검색량 0인 키워드 비율
    const zeroVolumeKws = keywords.filter((k) => k.monthlySearchVolume === 0);
    if (zeroVolumeKws.length >= 3 && zeroVolumeKws.length / keywords.length >= 0.3) {
      problems.push({
        type: "ZERO_VOLUME_KEYWORDS",
        title: "검색량 0인 키워드 다수",
        description: `${zeroVolumeKws.length}개 키워드가 검색량 0 — 사람들이 안 쓰는 키워드입니다. 더 실용적인 키워드로 교체 필요.`,
        severity: "warning",
        metric: { current: zeroVolumeKws.length, target: 0, unit: "개" },
      });
    }

    // 1위 경쟁사 격차 (큰 위협)
    const topComp = competitors[0];
    if (topComp && (topComp.receiptReviewCount ?? 0) > myReceiptReviews * 1.5) {
      const gap = (topComp.receiptReviewCount ?? 0) - myReceiptReviews;
      problems.push({
        type: "TOP_COMPETITOR_THREAT",
        title: `1위 경쟁사 격차 큼`,
        description: `"${topComp.competitorName}" 방문자 리뷰 ${topComp.receiptReviewCount}개 — 나보다 ${gap}개 많음. 추격 전략 필요.`,
        severity: "warning",
        metric: { current: myReceiptReviews, target: topComp.receiptReviewCount ?? 0, unit: "개" },
      });
    }

    // 키워드 자체가 너무 적음
    if (keywords.length < 5) {
      problems.push({
        type: "FEW_KEYWORDS",
        title: "추적 키워드 부족",
        description: `현재 ${keywords.length}개. 다양한 키워드로 노출 기회를 늘려야 합니다.`,
        severity: "info",
        metric: { current: keywords.length, target: 10, unit: "개" },
      });
    }

    // === 3. 업종별 키워드 전략 ===
    const keywordStrategy = await this.analyzeKeywordStrategy(store, keywords);

    // === 4. 오늘의 액션 생성 (룰 기반) ===
    let actions = this.generateActions(phase, problems, keywordStrategy, rankedKws.length);

    // === 5. AI로 액션 보강 (캐싱 적용 — 1시간) ===
    const aiContext = {
      storeName: store.name,
      category: store.category || "",
      myReceiptReviews,
      myBlogReviews,
      avgCompReviews,
      avgCompBlogs,
      avgRank,
      topCompetitor: competitors[0],
      phase: phase.label,
      phaseDescription: phase.description,
      topKeywords: keywords.slice(0, 5).map((k) => ({
        keyword: k.keyword,
        rank: k.currentRank,
        volume: k.monthlySearchVolume,
      })),
    };
    // 캐시 키: 매장 ID + 데이터 해시 (데이터 변경 시 자동 무효화)
    const dataHash = crypto
      .createHash("md5")
      .update(JSON.stringify(aiContext) + JSON.stringify(actions.slice(0, 3).map((a) => a.type)))
      .digest("hex")
      .slice(0, 12);
    const cacheKey = `marketing:actions:${storeId}:${dataHash}`;

    // 캐시 조회 — 있으면 AI 보강판 사용, 없으면 룰 기반으로 즉시 응답 + 백그라운드 AI
    const cached = await this.cache.get<Action[]>(cacheKey);
    let aiPending = false;

    if (cached && cached.length > 0) {
      this.logger.log(`AI 액션 캐시 HIT [${cacheKey}]`);
      actions = cached;
    } else {
      // 중복 실행 가드 (같은 해시 백그라운드 AI가 이미 돌고 있으면 스킵)
      const lockKey = `${cacheKey}:lock`;
      const lock = await this.cache.get<number>(lockKey);
      if (!lock) {
        aiPending = true;
        // 10분 락 (AI 최대 실행시간 + 버퍼)
        await this.cache.set(lockKey, Date.now(), 600);
        // 백그라운드 실행 — 응답을 블록하지 않음
        const baseSnapshot = actions.slice(0, 3);
        this.enrichActionsWithAI(baseSnapshot, aiContext)
          .then(async (enriched) => {
            if (enriched && enriched.length > 0) {
              await this.cache.set(cacheKey, enriched, 3600);
              this.logger.log(`[BG] AI 액션 캐시 저장 [${cacheKey}] TTL=1h`);
            }
          })
          .catch((e: any) => this.logger.warn(`[BG] AI 액션 보강 실패: ${e.message}`))
          .finally(async () => {
            await this.cache.del(lockKey).catch(() => {});
          });
      } else {
        this.logger.log(`AI 액션 보강 이미 진행 중 — 룰 기반으로 응답 [${cacheKey}]`);
        aiPending = true;
      }
    }

    return {
      phase: phase.code,
      phaseLabel: phase.label,
      phaseDescription: phase.description,
      problems,
      actions: actions.sort((a, b) => b.priority - a.priority).slice(0, 3),
      keywordStrategy,
      aiPending,
    };
  }

  // === 1. 마케팅 단계 판단 ===
  private determinePhase(
    reviews: number,
    avgRank: number | null,
    blogReviews: number,
    avgCompBlogs: number,
  ): { code: MarketingDiagnosis["phase"]; label: string; description: string } {

    // 리뷰 30개 미만 → 리뷰 최우선
    if (reviews < 30) {
      return {
        code: "REVIEW_FIRST",
        label: "리뷰 확보 단계",
        description: "다른 어떤 작업보다 리뷰 확보가 최우선입니다. 리뷰가 쌓여야 순위가 올라갑니다.",
      };
    }

    // 리뷰는 있는데 순위 50위 밖 → 트래픽 유입 필요
    if (reviews >= 30 && (avgRank == null || avgRank > 50)) {
      return {
        code: "TRAFFIC_NEEDED",
        label: "트래픽 유입 단계",
        description: "리뷰는 확보되었으나 검색 유입이 부족합니다. 키워드 전략과 블로그 노출이 필요합니다.",
      };
    }

    // 순위 30위 이내지만 최적화 여지 있음
    if (avgRank != null && avgRank <= 50 && avgRank > 10) {
      return {
        code: "OPTIMIZATION",
        label: "최적화 단계",
        description: "기본 체력은 갖춰졌습니다. 세부 키워드 전략과 콘텐츠로 순위를 높여야 합니다.",
      };
    }

    // 상위 10위 이내 → 유지
    return {
      code: "MAINTENANCE",
      label: "유지/강화 단계",
      description: "상위권을 유지하고 있습니다. 경쟁사 모니터링과 꾸준한 콘텐츠 관리가 필요합니다.",
    };
  }

  // === 2. 문제 진단 ===
  private diagnoseProblems(
    myReviews: number, myBlogs: number, mySaves: number,
    avgCompReviews: number, avgCompBlogs: number,
    avgRank: number | null, rankedCount: number, totalKws: number,
  ): Problem[] {
    const problems: Problem[] = [];

    // 리뷰 부족
    if (myReviews < 30) {
      problems.push({
        type: "REVIEW_CRITICAL",
        title: "리뷰 심각하게 부족",
        description: `리뷰 ${myReviews}개로는 네이버 알고리즘에서 노출되기 어렵습니다. 최소 30개 이상 확보하세요.`,
        severity: "critical",
        metric: { current: myReviews, target: 30, unit: "개" },
      });
    } else if (myReviews < avgCompReviews * 0.5) {
      problems.push({
        type: "REVIEW_SHORTAGE",
        title: "경쟁사 대비 리뷰 부족",
        description: `리뷰 ${myReviews}개. 경쟁사 평균 ${avgCompReviews}개의 절반도 안 됩니다.`,
        severity: "warning",
        metric: { current: myReviews, target: avgCompReviews, unit: "개" },
      });
    }

    // 순위 문제
    if (rankedCount === 0 && totalKws > 0) {
      problems.push({
        type: "NO_RANKING",
        title: "순위 미확인",
        description: "키워드 순위가 아직 체크되지 않았습니다.",
        severity: "warning",
      });
    } else if (avgRank != null && avgRank > 100) {
      problems.push({
        type: "RANKING_VERY_LOW",
        title: "검색 노출 거의 불가",
        description: `평균 ${avgRank}위. 100위 밖이면 사실상 검색 노출이 안 됩니다.`,
        severity: "critical",
        metric: { current: avgRank, target: 30, unit: "위" },
      });
    } else if (avgRank != null && avgRank > 30) {
      problems.push({
        type: "RANKING_LOW",
        title: "검색 순위 낮음",
        description: `평균 ${avgRank}위. 30위 이내에 들어야 실질적 노출이 됩니다.`,
        severity: "warning",
        metric: { current: avgRank, target: 30, unit: "위" },
      });
    }

    // 블로그 부족
    if (avgCompBlogs > 0 && myBlogs < avgCompBlogs * 0.3) {
      problems.push({
        type: "BLOG_SHORTAGE",
        title: "블로그 노출 부족",
        description: `블로그 ${myBlogs}개. 경쟁사 평균 ${avgCompBlogs}개 대비 ${Math.round(avgCompBlogs / Math.max(myBlogs, 1))}배 차이.`,
        severity: myBlogs < 10 ? "critical" : "warning",
        metric: { current: myBlogs, target: avgCompBlogs, unit: "개" },
      });
    }

    return problems;
  }

  // === 3. 업종별 키워드 전략 ===
  private async analyzeKeywordStrategy(
    store: any,
    keywords: any[],
  ): Promise<KeywordStrategy | null> {
    if (keywords.length === 0) return null;

    const category = store.category || "";

    // 검색량 대비 순위가 좋은 키워드 (집중할 것)
    const focus = keywords
      .filter((k) => k.currentRank != null && k.currentRank <= 30 && (k.monthlySearchVolume ?? 0) > 500)
      .map((k) => k.keyword);

    // 순위가 너무 낮고 경쟁이 심한 키워드 (포기 후보)
    const drop = keywords
      .filter((k) => k.currentRank != null && k.currentRank > 100 && (k.competitorCount ?? 0) > 10000)
      .map((k) => k.keyword);

    let recommendation = "";
    if (focus.length > 0 && drop.length > 0) {
      recommendation = `"${focus[0]}" 등 ${focus.length}개 키워드에 집중하고, "${drop[0]}" 등 경쟁 과열 키워드는 우선순위를 낮추세요.`;
    } else if (focus.length > 0) {
      recommendation = `"${focus[0]}" 등 ${focus.length}개 키워드가 유망합니다. 블로그 콘텐츠와 리뷰로 순위를 올리세요.`;
    } else if (drop.length > 0) {
      recommendation = `현재 상위 키워드가 없습니다. 경쟁이 덜한 세부 키워드부터 공략하세요.`;
    } else {
      recommendation = `아직 순위 데이터가 충분하지 않습니다. 순위 체크를 실행하세요.`;
    }

    return {
      industry: category,
      focusKeywords: focus.slice(0, 5),
      dropKeywords: drop.slice(0, 3),
      recommendation,
    };
  }

  // === 4. 오늘의 액션 생성 ===
  private generateActions(
    phase: { code: string },
    problems: Problem[],
    keywordStrategy: KeywordStrategy | null,
    rankedCount: number,
  ): Action[] {
    const actions: Action[] = [];

    // 리뷰 최우선 단계
    if (phase.code === "REVIEW_FIRST") {
      actions.push({
        type: "REVIEW",
        title: "리뷰 요청 시작하기",
        description: "방문 고객에게 리뷰를 요청하세요. AI가 리뷰 답글도 자동으로 작성합니다.",
        reason: "리뷰 30개 미만 — 다른 작업보다 리뷰가 최우선",
        href: "/reviews",
        priority: 100,
      });
      actions.push({
        type: "REVIEW_REPLY",
        title: "기존 리뷰에 답글 달기",
        description: "답글이 달린 매장은 재방문율과 리뷰 작성률이 높아집니다.",
        reason: "리뷰 답글은 재방문 유도 효과가 있음",
        href: "/reviews",
        priority: 90,
      });
    }

    // 트래픽 유입 단계
    if (phase.code === "TRAFFIC_NEEDED") {
      actions.push({
        type: "KEYWORD_CHECK",
        title: "키워드 순위 체크",
        description: "현재 어떤 키워드에서 노출되고 있는지 확인하세요.",
        reason: "리뷰는 있지만 검색 유입이 없음 — 순위 확인 필요",
        href: "/keywords",
        priority: 95,
      });
      actions.push({
        type: "BLOG_CONTENT",
        title: "블로그 콘텐츠 생성",
        description: "키워드 맞춤 블로그 글로 검색 노출을 확보하세요.",
        reason: "블로그 노출이 플레이스 순위에 직접 영향",
        href: "/content",
        priority: 85,
      });
    }

    // 최적화 단계
    if (phase.code === "OPTIMIZATION") {
      if (keywordStrategy?.focusKeywords.length) {
        actions.push({
          type: "KEYWORD_FOCUS",
          title: `"${keywordStrategy.focusKeywords[0]}" 집중 공략`,
          description: `이 키워드가 가장 유망합니다. 관련 콘텐츠를 늘리세요.`,
          reason: "검색량 대비 순위가 좋은 키워드에 집중",
          href: "/keywords",
          priority: 90,
        });
      }
      actions.push({
        type: "COMPETITOR_CHECK",
        title: "경쟁사 동향 확인",
        description: "경쟁사의 리뷰/순위 변화를 모니터링하세요.",
        reason: "최적화 단계에서는 경쟁사 대비 포지션이 중요",
        href: "/competitors",
        priority: 80,
      });
    }

    // 유지 단계
    if (phase.code === "MAINTENANCE") {
      actions.push({
        type: "MONITOR",
        title: "순위 모니터링",
        description: "상위 순위를 유지하기 위해 꾸준히 확인하세요.",
        reason: "상위권 유지가 곧 매출 유지",
        href: "/keywords",
        priority: 70,
      });
      actions.push({
        type: "CONTENT_REGULAR",
        title: "정기 콘텐츠 발행",
        description: "주 1~2회 플레이스 소식이나 블로그 글을 발행하세요.",
        reason: "꾸준한 활동이 알고리즘에 유리",
        href: "/content",
        priority: 65,
      });
    }

    // 공통: 문제 기반 액션
    for (const p of problems) {
      if (p.type === "BLOG_SHORTAGE" && !actions.find((a) => a.type === "BLOG_CONTENT")) {
        actions.push({
          type: "BLOG_CONTENT",
          title: "블로그 콘텐츠 생성",
          description: "경쟁사 대비 블로그 노출이 부족합니다.",
          reason: p.description,
          href: "/content",
          priority: 75,
        });
      }
      if (p.type === "NO_RANKING" && !actions.find((a) => a.type === "KEYWORD_CHECK")) {
        actions.push({
          type: "KEYWORD_CHECK",
          title: "순위 체크 실행",
          description: "현재 순위를 확인해야 전략을 세울 수 있습니다.",
          reason: "순위 데이터 없음",
          href: "/keywords",
          priority: 88,
        });
      }
    }

    return actions;
  }

  // 유틸: 배열 평균
  private avg(arr: any[], field: string): number {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((s, item) => s + (item[field] ?? 0), 0) / arr.length);
  }

  /**
   * AI로 액션 보강 — 룰 기반 액션에 구체적 숫자, 단계, 예상 효과 추가
   */
  private async enrichActionsWithAI(
    baseActions: Action[],
    context: {
      storeName: string;
      category: string;
      myReceiptReviews: number;
      myBlogReviews: number;
      avgCompReviews: number;
      avgCompBlogs: number;
      avgRank: number | null;
      topCompetitor: any;
      phase: string;
      phaseDescription: string;
      topKeywords: Array<{ keyword: string; rank: number | null; volume: number | null }>;
    },
  ): Promise<Action[] | null> {
    if (baseActions.length === 0) return null;

    const systemPrompt = `너는 자영업 마케팅 컨설턴트다.
사장님이 오늘 당장 실행할 수 있는 구체적 액션을 만든다.

원칙:
1. 추상적 명령 X — 숫자로 구체화 ("리뷰 5개 받으면 평균 도달")
2. 단계별 실행 방법 제시 (steps)
3. 예상 효과 명시 (expectedEffect)
4. 사장님이 30초 안에 이해할 수 있어야`;

    const userPrompt = `매장 정보:
- 매장명: ${context.storeName}
- 업종: ${context.category}
- 마케팅 단계: ${context.phase} — ${context.phaseDescription}
- 내 방문자 리뷰: ${context.myReceiptReviews}개 (경쟁사 평균 ${context.avgCompReviews}개)
- 내 블로그 리뷰: ${context.myBlogReviews}개 (경쟁사 평균 ${context.avgCompBlogs}개)
- 평균 검색 순위: ${context.avgRank ?? "N/A"}위
- 1위 경쟁사: ${context.topCompetitor?.competitorName ?? "없음"} (방문자 ${context.topCompetitor?.receiptReviewCount ?? 0}개)
- 주요 키워드 5개:
${context.topKeywords.map((k) => `  · "${k.keyword}" — ${k.rank ? `${k.rank}위` : "순위없음"}, 월 ${k.volume?.toLocaleString() ?? "?"}회`).join("\n")}

기본 액션 (이걸 보강하라):
${baseActions.map((a, i) => `${i + 1}. ${a.title} — ${a.description}`).join("\n")}

작업:
위 매장 데이터에 맞춰 각 액션을 구체적으로 다듬어라.

JSON 응답 (정확히 ${baseActions.length}개 액션):
[
  {
    "type": "기존 type 유지",
    "title": "구체적 제목 (숫자 포함)",
    "description": "한 줄 설명",
    "reason": "왜 지금 이 매장에 필요한지 (숫자 근거)",
    "href": "기존 href 유지",
    "priority": 기존 priority,
    "steps": ["1단계: ...", "2단계: ...", "3단계: ..."],
    "expectedEffect": "예상 효과 (예: 리뷰 5개 = 평균 도달, 1주 내 가능)",
    "metric": { "current": 현재값, "target": 목표값, "unit": "단위" }
  },
  ...
]

JSON 배열만 반환. 다른 텍스트 X.`;

    try {
      const response = await this.ai.call(systemPrompt, userPrompt);
      const match = response.content.match(/\[[\s\S]*\]/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      this.logger.log(`AI 액션 보강 완료 [${response.provider}]: ${parsed.length}개`);

      // baseActions의 type/href는 보존, AI 텍스트만 사용
      return parsed.map((a, i) => {
        const base = baseActions[i] || baseActions[0];
        return {
          type: a.type || base.type,
          title: a.title || base.title,
          description: a.description || base.description,
          reason: a.reason || base.reason,
          href: a.href || base.href,
          priority: a.priority ?? base.priority,
          steps: Array.isArray(a.steps) ? a.steps.slice(0, 4) : undefined,
          expectedEffect: typeof a.expectedEffect === "string" ? a.expectedEffect : undefined,
          metric: a.metric && typeof a.metric.current === "number" ? a.metric : undefined,
        };
      });
    } catch (e: any) {
      this.logger.warn(`AI 액션 파싱 실패: ${e.message}`);
      return null;
    }
  }
}
