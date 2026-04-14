import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import { promisify } from "util";
import * as which from "which";
import axios from "axios";

const execFileAsync = promisify(execFile);

export interface AIResponse {
  content: string;
  provider: string; // 어떤 방식으로 응답했는지
  model?: string;
}

@Injectable()
export class AIProvider {
  private readonly logger = new Logger(AIProvider.name);
  private readonly anthropicApiKey: string;
  private readonly openaiApiKey: string;

  constructor(private config: ConfigService) {
    this.anthropicApiKey = this.config.get<string>("ANTHROPIC_API_KEY") || "";
    this.openaiApiKey = this.config.get<string>("OPENAI_API_KEY") || "";
  }

  /**
   * AI 호출 (5단계 폴백)
   * 1. Claude CLI (구독 활용, $0)
   * 2. ChatGPT CLI (구독 활용, $0)
   * 3. Claude API (API 키)
   * 4. OpenAI API (API 키)
   * 5. 데이터 기반 응답 (항상 동작)
   */
  async call(
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<AIResponse> {
    const temp = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 4096;
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // 1단계: Claude CLI
    try {
      const result = await this.callClaudeCli(fullPrompt);
      if (result) {
        this.logger.log("AI 응답: Claude CLI 사용");
        return { content: result, provider: "claude_cli", model: "claude-cli" };
      }
    } catch (e: any) {
      this.logger.warn(`Claude CLI 사용 불가: ${e.message}`);
    }

    // 2단계: ChatGPT CLI
    try {
      const result = await this.callChatgptCli(fullPrompt);
      if (result) {
        this.logger.log("AI 응답: ChatGPT CLI 사용");
        return {
          content: result,
          provider: "chatgpt_cli",
          model: "chatgpt-cli",
        };
      }
    } catch (e: any) {
      this.logger.warn(`ChatGPT CLI 사용 불가: ${e.message}`);
    }

    // 3단계: Claude API
    if (this.anthropicApiKey) {
      try {
        const result = await this.callClaudeApi(
          systemPrompt,
          userPrompt,
          temp,
          maxTokens,
        );
        this.logger.log("AI 응답: Claude API 사용");
        return {
          content: result,
          provider: "claude_api",
          model: "claude-sonnet-4-20250514",
        };
      } catch (e: any) {
        this.logger.warn(`Claude API 호출 실패: ${e.message}`);
      }
    }

    // 4단계: OpenAI API
    if (this.openaiApiKey) {
      try {
        const result = await this.callOpenaiApi(
          systemPrompt,
          userPrompt,
          temp,
          maxTokens,
        );
        this.logger.log("AI 응답: OpenAI API 사용");
        return { content: result, provider: "openai_api", model: "gpt-4o" };
      } catch (e: any) {
        this.logger.warn(`OpenAI API 호출 실패: ${e.message}`);
      }
    }

    // 5단계: 데이터 기반 응답 (모든 AI 프로바이더 실패 시)
    // — 하드코딩 문구 금지. userPrompt 의 실데이터로부터 동적 생성.
    this.logger.warn("모든 AI 프로바이더 사용 불가 → 데이터 기반 동적 응답 생성");
    return {
      content: this.generateFallbackResponse(userPrompt, systemPrompt),
      provider: "fallback_data",
    };
  }

  /**
   * 분석용 호출 (낮은 temperature)
   */
  async analyze(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
    return this.call(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 4096,
    });
  }

  /**
   * 콘텐츠 생성용 호출 (높은 temperature)
   */
  async generate(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<AIResponse> {
    return this.call(systemPrompt, userPrompt, {
      temperature: 0.7,
      maxTokens: 2048,
    });
  }

  /**
   * 고객 API Key 우선 사용 (생성형 작업: 블로그/댓글 등)
   * 고객 키가 있으면 고객 키로 호출, 없으면 서비스 키 폴백
   */
  async callWithUserKey(
    apiKey: string | null | undefined,
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<AIResponse> {
    const temp = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 4096;

    if (apiKey) {
      try {
        const result = await this.callClaudeApi(
          systemPrompt,
          userPrompt,
          temp,
          maxTokens,
          apiKey,
        );
        return {
          content: result,
          provider: "claude_api_user",
          model: "claude-sonnet-4-20250514",
        };
      } catch (e: any) {
        this.logger.warn(`고객 API Key 호출 실패: ${e.message} — 서비스 키로 폴백`);
      }
    }

    // 폴백: 기존 5단계 로직
    return this.call(systemPrompt, userPrompt, options);
  }

  // ===== CLI 호출 =====

  private async callClaudeCli(prompt: string): Promise<string | null> {
    const claudePath = await this.findCommand("claude");
    if (!claudePath) return null;

    const { stdout } = await execFileAsync(claudePath, ["-p", prompt], {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    return stdout?.trim() || null;
  }

  private async callChatgptCli(prompt: string): Promise<string | null> {
    // chatgpt 또는 openai 명령어 탐색
    let cliPath: string | null = null;
    for (const cmd of ["chatgpt", "openai"]) {
      cliPath = await this.findCommand(cmd);
      if (cliPath) break;
    }
    if (!cliPath) return null;

    const { stdout } = await execFileAsync(cliPath, ["-p", prompt], {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    return stdout?.trim() || null;
  }

  // ===== API 호출 =====

  private async callClaudeApi(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
    apiKey?: string,
  ): Promise<string> {
    const key = apiKey || this.anthropicApiKey;
    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 30000,
      },
    );

    return resp.data.content[0].text;
  }

  private async callOpenaiApi(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    return resp.data.choices[0].message.content;
  }

  // ===== 유틸 =====

  private async findCommand(cmd: string): Promise<string | null> {
    try {
      return await which(cmd);
    } catch {
      return null;
    }
  }

  /**
   * 데이터 기반 폴백 응답 생성기.
   * AI 가 모두 실패해도 사용자에게 빈 메시지를 주지 않기 위한 최후의 안전망.
   *
   * 핵심: userPrompt 가 JSON 이라는 가정 (analysis/briefing 모두 JSON.stringify 로 전달).
   * 실제 데이터 (점수, 키워드, 경쟁사, 순위 변동) 를 파싱해서 가공된 응답을 만든다.
   * 어떤 것도 위조하지 않고 입력 데이터로부터만 결론 도출.
   */
  private generateFallbackResponse(userPrompt: string, systemPrompt: string): string {
    let ctx: any = null;
    try {
      ctx = JSON.parse(userPrompt);
    } catch {
      // JSON 이 아니면 명시적 에러 응답
      return JSON.stringify({
        error: "ai_unavailable",
        message:
          "AI 프로바이더 모두 실패. 사용자 프롬프트가 JSON 형식이 아니어서 데이터 기반 분석도 불가합니다.",
      });
    }

    // 시스템 프롬프트로 분석/브리핑 구분
    const isBriefing = /브리핑|매니저|오늘 할 일|todayActions/.test(systemPrompt);
    if (isBriefing) {
      return JSON.stringify(this.buildBriefingFromData(ctx));
    }
    return JSON.stringify(this.buildAnalysisFromData(ctx));
  }

  /** ===== 데이터 기반 분석 응답 빌더 ===== */
  private buildAnalysisFromData(ctx: any): any {
    const store = ctx.store || {};
    const keywords: any[] = ctx.keywords || [];
    const competitors: any[] = ctx.competitors || [];
    const rankHistory: any[] = ctx.rankHistory || [];

    // 1) 경쟁사 평균 리뷰
    const compReviews = competitors
      .map((c) => (c.blogReviews ?? 0) + (c.receiptReviews ?? 0))
      .filter((n) => n > 0);
    const avgComp = compReviews.length
      ? Math.round(compReviews.reduce((a, b) => a + b, 0) / compReviews.length)
      : null;
    const myReviews = (store.blogReviews ?? 0) + (store.receiptReviews ?? 0);

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // 2) 강점/약점 — 실데이터 비교
    if (avgComp !== null) {
      if (myReviews >= avgComp * 1.2) {
        strengths.push(
          `경쟁사 평균 ${avgComp}건 대비 리뷰가 ${myReviews}건으로 ${Math.round(((myReviews - avgComp) / avgComp) * 100)}% 많음`,
        );
      } else if (myReviews < avgComp * 0.8) {
        weaknesses.push(
          `경쟁사 평균 ${avgComp}건 대비 리뷰가 ${myReviews}건으로 부족 (${Math.round(((avgComp - myReviews) / avgComp) * 100)}% 미달)`,
        );
      }
    }

    // 3) 순위 분석
    const rankedKws = keywords.filter((k) => k.currentRank != null);
    if (rankedKws.length > 0) {
      const avgRank = Math.round(
        rankedKws.reduce((a, k) => a + k.currentRank, 0) / rankedKws.length,
      );
      if (avgRank <= 5)
        strengths.push(`주요 키워드 평균 순위 ${avgRank}위 — 상위 노출 양호`);
      else if (avgRank > 20)
        weaknesses.push(`주요 키워드 평균 순위 ${avgRank}위 — 노출 부족`);

      // 상승/하락 키워드
      const rising = rankedKws.filter(
        (k) => k.previousRank && k.currentRank < k.previousRank,
      );
      const falling = rankedKws.filter(
        (k) => k.previousRank && k.currentRank > k.previousRank,
      );
      if (rising.length > 0)
        strengths.push(
          `${rising.length}개 키워드 순위 상승 (${rising.map((k) => k.keyword).slice(0, 3).join(", ")})`,
        );
      if (falling.length > 0)
        weaknesses.push(
          `${falling.length}개 키워드 순위 하락 (${falling.map((k) => k.keyword).slice(0, 3).join(", ")})`,
        );
    }

    // 4) 검색량
    const totalVol = keywords.reduce(
      (a, k) => a + (k.monthlyVolume ?? 0),
      0,
    );
    if (totalVol > 50000) strengths.push(`총 월 검색량 ${totalVol.toLocaleString()}회 — 트래픽 풍부`);
    else if (totalVol < 5000) weaknesses.push(`총 월 검색량 ${totalVol.toLocaleString()}회 — 키워드 발굴 필요`);

    // 5) 추천 액션 (실데이터에서 도출)
    const recommendations: any[] = [];
    if (avgComp !== null && myReviews < avgComp) {
      recommendations.push({
        priority: "HIGH",
        action: "방문자 리뷰 확보 캠페인",
        reason: `경쟁사 평균 ${avgComp}건 vs 우리 ${myReviews}건`,
        expectedEffect: "경쟁사 대비 리뷰 격차 축소 → 노출 점수 상승",
      });
    }
    const fallingKws = rankedKws.filter(
      (k) => k.previousRank && k.currentRank > k.previousRank,
    );
    if (fallingKws.length > 0) {
      const top = fallingKws[0];
      recommendations.push({
        priority: "HIGH",
        action: `'${top.keyword}' 관련 콘텐츠 보강`,
        reason: `${top.previousRank}위 → ${top.currentRank}위 하락`,
        expectedEffect: "키워드 순위 회복",
      });
    }
    const noRankKws = keywords.filter((k) => k.currentRank == null);
    if (noRankKws.length > 0) {
      recommendations.push({
        priority: "MEDIUM",
        action: `미체크 키워드 ${noRankKws.length}개 순위 측정`,
        reason: "순위 데이터 부재로 전략 수립 어려움",
        expectedEffect: "데이터 기반 의사결정 가능",
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        priority: "MEDIUM",
        action: "신규 키워드 발굴 및 등록",
        reason: "현재 키워드 풀에서 유의미한 변동이 감지되지 않음",
        expectedEffect: "추적 가능한 지표 확장",
      });
    }

    // 6) 점수 — 단순 가중치 (분석 모듈의 calculateFinalScore 가 한 번 더 보정)
    let baseScore = 50;
    if (avgComp !== null && myReviews > 0) {
      baseScore = Math.min(95, Math.max(10, Math.round((myReviews / Math.max(avgComp, 1)) * 50)));
    }

    return {
      competitiveScore: baseScore,
      summary: `${store.name ?? "매장"}: 데이터 기반 분석 (AI 미사용). 리뷰 ${myReviews}건, 키워드 ${keywords.length}개, 경쟁사 ${competitors.length}개 비교.`,
      strengths: strengths.length > 0 ? strengths : ["분석 가능한 강점이 데이터에서 발견되지 않음"],
      weaknesses: weaknesses.length > 0 ? weaknesses : ["분석 가능한 약점이 데이터에서 발견되지 않음"],
      competitorComparison: avgComp !== null
        ? {
            avgReceiptReviews: Math.round(
              competitors.reduce((a, c) => a + (c.receiptReviews ?? 0), 0) /
                Math.max(competitors.length, 1),
            ),
            myReceiptReviews: store.receiptReviews ?? 0,
            gap: `경쟁사 평균 ${avgComp}건 vs 우리 ${myReviews}건`,
          }
        : null,
      recommendations,
      _meta: { source: "data_fallback", reason: "ai_providers_unavailable" },
    };
  }

  /** ===== 데이터 기반 브리핑 응답 빌더 ===== */
  private buildBriefingFromData(ctx: any): any {
    const store = ctx.store || {};
    const keywords: any[] = ctx.keywords || [];
    const competitors: any[] = ctx.competitors || [];
    const seasonalEvents: any[] = ctx.seasonalEvents || [];
    const dayOfWeek = ctx.dayOfWeek ?? "";

    // 트렌드 (실제 변동 데이터)
    const trends = keywords
      .filter((k) => k.change != null && Math.abs(k.change) > 5)
      .slice(0, 3)
      .map((k) => ({
        keyword: k.keyword,
        change: `${k.change > 0 ? "+" : ""}${k.change}%`,
        insight:
          k.change > 0
            ? "검색량 상승 — 콘텐츠 강화 기회"
            : "검색량 하락 — 대체 키워드 검토 필요",
      }));

    // 경쟁사 알림 (리뷰 증가)
    const competitorAlert =
      competitors.find((c) => (c.reviewChange ?? 0) >= 3)
        ? competitors
            .filter((c) => (c.reviewChange ?? 0) >= 3)
            .map((c) => `${c.name}: 최근 리뷰 +${c.reviewChange}건`)
            .join(" / ")
        : null;

    // 오늘 할 일 (실데이터에서 우선순위로 추출)
    const actions: any[] = [];

    // 1) 순위 하락 키워드 → 콘텐츠 우선
    const fallingKw = keywords.find((k) => {
      const rc = k.rankChange;
      return rc?.change != null && rc.change < 0;
    });
    if (fallingKw) {
      actions.push({
        order: actions.length + 1,
        action: `'${fallingKw.keyword}' 키워드로 플레이스 게시글 작성`,
        reason: `순위가 ${fallingKw.rankChange.previous}위 → ${fallingKw.rankChange.current}위로 하락`,
        howTo: "신메뉴 또는 매장 분위기 사진 + 키워드 자연스럽게 포함",
      });
    }

    // 2) 시즌 이벤트
    if (seasonalEvents.length > 0) {
      const ev = seasonalEvents[0];
      actions.push({
        order: actions.length + 1,
        action: `'${ev.name}' 키워드 활용`,
        reason: `현재 진행 중인 시즌 이벤트 (${(ev.keywords || []).slice(0, 3).join(", ")})`,
        howTo: "대표 키워드에 추가하거나 게시글 제목에 활용",
      });
    }

    // 3) 경쟁사 리뷰 증가 → 리뷰 캠페인
    if (competitorAlert) {
      actions.push({
        order: actions.length + 1,
        action: "방문 고객에게 리뷰 작성 요청",
        reason: competitorAlert,
        howTo: "테이블 위 QR 코드 또는 영수증에 안내 문구",
      });
    }

    // 부족하면 안전 액션 (단, 실제 매장 데이터 기반)
    while (actions.length < 3) {
      const candidates = [
        {
          condition: keywords.length < 5,
          action: "신규 키워드 3~5개 발굴",
          reason: `현재 등록된 키워드가 ${keywords.length}개로 부족`,
          howTo: "AI 키워드 추천 페이지에서 추가",
        },
        {
          condition: keywords.some((k) => k.currentRank == null),
          action: "미체크 키워드 순위 측정",
          reason: "데이터가 없는 키워드는 전략 수립 불가",
          howTo: "키워드 페이지에서 '순위 체크' 실행",
        },
        {
          condition: true,
          action: "매장 대표 사진 1장 업로드",
          reason: "신선한 콘텐츠는 검색 노출 점수에 긍정적",
          howTo: "최근 방문 고객의 분위기, 신메뉴 등",
        },
      ];
      const next = candidates.find((c) => c.condition && !actions.find((a) => a.action === c.action));
      if (!next) break;
      actions.push({
        order: actions.length + 1,
        action: next.action,
        reason: next.reason,
        howTo: next.howTo,
      });
    }

    return {
      greeting: `사장님, ${dayOfWeek}요일 아침이에요. ${store.name ?? "매장"} 오늘 브리핑입니다 (AI 미사용 — 데이터 기반).`,
      trends,
      competitorAlert,
      todayActions: actions,
      motivation: "데이터로 검증된 액션부터 차근차근 실행해봐요.",
      _meta: { source: "data_fallback", reason: "ai_providers_unavailable" },
    };
  }
}
