import { ConfigService } from "@nestjs/config";
import { CacheService } from "./cache.service";

/**
 * CacheService 통합 테스트.
 * 실제 Redis (docker-compose redis 6382) 연결.
 *
 * Redis 가 없는 환경에서는 비활성화 동작(get/set 모두 no-op) 검증.
 */
describe("CacheService (integration)", () => {
  let svc: CacheService;

  beforeAll(async () => {
    const config = {
      get: (k: string) =>
        k === "REDIS_URL" ? process.env.REDIS_URL || "redis://localhost:6382" : undefined,
    } as unknown as ConfigService;
    svc = new CacheService(config);
    await svc.onModuleInit();
    // 연결 안정 대기
    await new Promise((r) => setTimeout(r, 800));
  });

  afterAll(async () => {
    await svc.onModuleDestroy();
  });

  it("Redis 연결 가능", () => {
    expect(svc.isAvailable()).toBe(true);
  });

  it("set → get 라운드트립 (객체)", async () => {
    const key = `test:roundtrip:${Date.now()}`;
    const val = { id: 1, name: "꼼장어", tags: ["맛집", "청주"] };
    const ok = await svc.set(key, val, 60);
    expect(ok).toBe(true);
    const got = await svc.get<typeof val>(key);
    expect(got).toEqual(val);
    await svc.del(key);
    expect(await svc.get(key)).toBeNull();
  });

  it("set → get 라운드트립 (숫자)", async () => {
    const key = `test:num:${Date.now()}`;
    await svc.set(key, 12345, 30);
    expect(await svc.get<number>(key)).toBe(12345);
    await svc.del(key);
  });

  it("delByPattern 으로 일괄 삭제", async () => {
    const prefix = `test:pattern:${Date.now()}`;
    await svc.set(`${prefix}:1`, "a", 60);
    await svc.set(`${prefix}:2`, "b", 60);
    await svc.set(`${prefix}:3`, "c", 60);
    const deleted = await svc.delByPattern(`${prefix}:*`);
    expect(deleted).toBe(3);
    expect(await svc.get(`${prefix}:1`)).toBeNull();
    expect(await svc.get(`${prefix}:2`)).toBeNull();
  });

  it("키 빌더 정의 확인", () => {
    expect(CacheService.keys.briefingToday("abc")).toBe("briefing:today:abc");
    expect(CacheService.keys.analysisLatest("abc")).toBe("analysis:latest:abc");
  });
});
