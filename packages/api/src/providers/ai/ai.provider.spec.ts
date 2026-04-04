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

  it("CLI와 API 키 없이 폴백 응답을 반환한다", async () => {
    const result = await provider.call("system", "user");
    expect(result.provider).toBe("fallback");
    expect(result.content).toBeTruthy();
  });

  it("analyze()도 폴백 응답을 반환한다", async () => {
    const result = await provider.analyze("system", "user");
    expect(result.provider).toBe("fallback");
  });

  it("generate()도 폴백 응답을 반환한다", async () => {
    const result = await provider.generate("system", "user");
    expect(result.provider).toBe("fallback");
  });

  it("폴백 응답이 유효한 JSON이다", async () => {
    const result = await provider.call("system", "user");
    const parsed = JSON.parse(result.content);
    expect(parsed.competitiveScore).toBeDefined();
    expect(parsed.recommendations).toBeDefined();
  });
});
