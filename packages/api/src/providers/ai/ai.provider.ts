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

    // 5단계: 데이터 기반 응답 (항상 동작)
    this.logger.warn("모든 AI 프로바이더 사용 불가, 데이터 기반 응답 사용");
    return {
      content: this.generateFallbackResponse(userPrompt),
      provider: "fallback",
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
   * 사용자 API 키로 호출 (프리미엄 전용)
   */
  async callWithUserKey(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<AIResponse> {
    const temp = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 4096;

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

  private generateFallbackResponse(prompt: string): string {
    // AI 없이 기본 데이터 기반 응답
    return JSON.stringify({
      competitiveScore: 50,
      summary:
        "AI 분석을 사용할 수 없어 기본 데이터 기반으로 응답합니다. Claude CLI 또는 API 키를 설정해주세요.",
      strengths: ["데이터 수집 완료"],
      weaknesses: ["AI 분석 미완료"],
      recommendations: [
        {
          priority: "HIGH",
          action: "AI 설정을 완료하여 상세 분석을 받으세요",
          reason: "CLI 또는 API 키가 설정되지 않았습니다",
          expectedEffect: "상세한 마케팅 인사이트 제공",
        },
      ],
    });
  }
}
