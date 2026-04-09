import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Redis 캐시 서비스.
 * 기획서 5.2.2: "AI 분석 결과를 Redis에 캐싱하여 사용자 접속 시 즉시 응답"
 *
 * 설계 원칙:
 *  - 캐시 미스는 정상 동작 (DB 폴백)
 *  - Redis 다운은 경고만 — 핵심 경로 차단 금지
 *  - 새벽 배치 후 집합적 set, 사용자 read 시 단순 get
 *  - 키 네임스페이스로 무효화 가능
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private connected = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) {
      this.logger.warn("REDIS_URL 미설정 — 캐시 비활성화 (DB 직접 조회)");
      return;
    }
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on("ready", () => {
      this.connected = true;
      this.logger.log(`Redis 연결됨: ${url}`);
    });
    this.client.on("error", (e) => {
      if (this.connected) {
        // 최초 실패만 로깅, 반복 실패 노이즈 차단
        this.connected = false;
        this.logger.error(`Redis 오류: ${e.message}`);
      }
    });
    this.client.on("end", () => {
      this.connected = false;
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  isAvailable(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * JSON 직렬화 가능한 값 캐싱.
   * @param ttlSec 기본 24시간 (새벽 배치 주기)
   */
  async set<T>(key: string, value: T, ttlSec = 86400): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const payload = JSON.stringify({ v: value, ts: Date.now() });
      await this.client!.set(key, payload, "EX", ttlSec);
      return true;
    } catch (e: any) {
      this.logger.warn(`cache set 실패 [${key}]: ${e.message}`);
      return false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;
    try {
      const raw = await this.client!.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.v as T;
    } catch (e: any) {
      this.logger.warn(`cache get 실패 [${key}]: ${e.message}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.client!.del(key);
    } catch (e: any) {
      this.logger.warn(`cache del 실패 [${key}]: ${e.message}`);
    }
  }

  /**
   * 패턴 기반 무효화 (예: 매장의 모든 캐시).
   * SCAN 사용 — KEYS 는 운영 환경에서 금지.
   */
  async delByPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) return 0;
    let count = 0;
    try {
      const stream = this.client!.scanStream({ match: pattern, count: 100 });
      for await (const keys of stream) {
        if ((keys as string[]).length > 0) {
          count += (keys as string[]).length;
          await this.client!.del(...(keys as string[]));
        }
      }
    } catch (e: any) {
      this.logger.warn(`cache delByPattern 실패 [${pattern}]: ${e.message}`);
    }
    return count;
  }

  // ===== 키 빌더 (한 곳에서 관리) =====
  static keys = {
    briefingToday: (storeId: string) => `briefing:today:${storeId}`,
    analysisLatest: (storeId: string) => `analysis:latest:${storeId}`,
    keywordsByStore: (storeId: string) => `keywords:${storeId}`,
    competitorsByStore: (storeId: string) => `competitors:${storeId}`,
    storePattern: (storeId: string) => `*:${storeId}`,
    festival: (region: string) => `tourapi:festival:${region}`,
    keywordVolume: (kw: string) => `searchad:vol:${kw}`,
  };
}
