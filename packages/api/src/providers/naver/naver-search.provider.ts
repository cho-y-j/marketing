import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

export interface NaverPlaceResult {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

export interface NaverBlogResult {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
}

@Injectable()
export class NaverSearchProvider {
  private readonly logger = new Logger(NaverSearchProvider.name);
  private readonly client: AxiosInstance;
  private lastCallTime = 0;
  private readonly minInterval = 100; // 초당 10회 = 100ms 간격

  constructor(private config: ConfigService) {
    this.client = axios.create({
      baseURL: "https://openapi.naver.com/v1",
      headers: {
        "X-Naver-Client-Id": this.config.get("NAVER_CLIENT_ID"),
        "X-Naver-Client-Secret": this.config.get("NAVER_CLIENT_SECRET"),
      },
      timeout: 10000,
    });
  }

  // Rate Limit 대기
  private async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minInterval) {
      await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastCallTime = Date.now();
  }

  // 재시도 래퍼
  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.throttle();
        return await fn();
      } catch (e: any) {
        this.logger.warn(`API 호출 실패 (${i + 1}/${retries}): ${e.message}`);
        if (i === retries - 1) throw e;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error("재시도 초과");
  }

  // 장소 검색
  async searchPlace(
    query: string,
    count = 5,
  ): Promise<NaverPlaceResult[]> {
    return this.withRetry(async () => {
      const resp = await this.client.get("/search/local.json", {
        params: { query, display: count, sort: "comment" },
      });
      return resp.data.items as NaverPlaceResult[];
    });
  }

  // 블로그 검색
  async searchBlog(
    query: string,
    count = 10,
  ): Promise<NaverBlogResult[]> {
    return this.withRetry(async () => {
      const resp = await this.client.get("/search/blog.json", {
        params: { query, display: count, sort: "sim" },
      });
      return resp.data.items as NaverBlogResult[];
    });
  }
}
