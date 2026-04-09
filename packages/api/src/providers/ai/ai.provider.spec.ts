import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AIProvider } from "./ai.provider";

// which 모킹 — CLI를 찾지 못하도록
jest.mock("which", () => jest.fn().mockRejectedValue(new Error("not found")));

const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
    };
    return map[key] || "";
  }),
};

describe("AIProvider", () => {
  let provider: AIProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIProvider,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    provider = module.get<AIProvider>(AIProvider);
  });

  // 분석용 시스템 프롬프트 — 폴백이 분석 응답을 빌드하도록 트리거
  const ANALYSIS_PROMPT = "너는 자영업 마케팅 전문가다. 매장 데이터로 강점/약점/추천을 출력한다.";
  // userPrompt 는 JSON 이어야 하므로 빈 객체라도 JSON 으로 전달
  const EMPTY_CTX = JSON.stringify({ store: {}, keywords: [], competitors: [] });

  it("CLI/API 키 없이 데이터 기반 폴백 응답을 반환한다", async () => {
    const result = await provider.call(ANALYSIS_PROMPT, EMPTY_CTX);
    expect(result.provider).toBe("fallback_data");
    expect(result.content).toBeTruthy();
  });

  it("analyze()도 폴백 응답을 반환한다", async () => {
    const result = await provider.analyze(ANALYSIS_PROMPT, EMPTY_CTX);
    expect(result.provider).toBe("fallback_data");
  });

  it("generate()도 폴백 응답을 반환한다", async () => {
    const result = await provider.generate(ANALYSIS_PROMPT, EMPTY_CTX);
    expect(result.provider).toBe("fallback_data");
  });

  it("분석 폴백 응답이 유효한 JSON이고 필수 필드 포함", async () => {
    const result = await provider.call(ANALYSIS_PROMPT, EMPTY_CTX);
    const parsed = JSON.parse(result.content);
    expect(parsed.competitiveScore).toBeDefined();
    expect(parsed.recommendations).toBeDefined();
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    // 데이터 폴백임을 명시하는 메타 필드
    expect(parsed._meta?.source).toBe("data_fallback");
  });

  it("브리핑 시스템 프롬프트면 브리핑 형식으로 폴백", async () => {
    const briefingPrompt =
      "너는 자영업 사장님의 든든한 마케팅 매니저다. todayActions 3개를 제시한다.";
    const briefingCtx = JSON.stringify({
      store: { name: "테스트매장" },
      keywords: [],
      competitors: [],
      seasonalEvents: [],
      dayOfWeek: "수",
    });
    const result = await provider.call(briefingPrompt, briefingCtx);
    const parsed = JSON.parse(result.content);
    expect(parsed.greeting).toBeDefined();
    expect(Array.isArray(parsed.todayActions)).toBe(true);
    expect(parsed._meta?.source).toBe("data_fallback");
  });

  it("JSON 이 아닌 userPrompt 는 명시적 에러 응답", async () => {
    const result = await provider.call(ANALYSIS_PROMPT, "this is not json");
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toBe("ai_unavailable");
  });
});
