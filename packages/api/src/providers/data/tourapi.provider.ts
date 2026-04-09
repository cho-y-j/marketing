import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { CacheService } from "../../common/cache.service";

/**
 * 한국관광공사 TourAPI (KorService2) 프로바이더.
 *
 * 사용 엔드포인트:
 *  - searchFestival2: 행사/축제 정보 (eventStartDate 필수)
 *  - areaCode2: 시도/시군구 코드 (캐싱)
 *
 * 매뉴얼 v4.4 기준. 응답 형식: JSON (_type=json).
 *
 * 정책:
 *  - serviceKey 미설정 → 메소드 호출 시 NotConfiguredError 발생
 *  - 키 인코딩: data.go.kr 에서 발급한 일반 인증키 (이미 인코딩됨) — encodeURIComponent 금지
 *  - 응답이 XML(에러)이면 명시적 에러
 *  - 결과는 Redis 캐싱 (24시간) — 일 1,000건 트래픽 보호
 */

export class TourapiNotConfiguredError extends Error {
  constructor() {
    super("TOURAPI_KEY 환경변수가 설정되지 않았습니다 (공공데이터 포털 인증키 필요)");
  }
}

export interface TourapiFestival {
  contentid: string;
  title: string;
  addr1: string;
  addr2?: string;
  eventstartdate: string; // YYYYMMDD
  eventenddate: string;
  areacode?: string;
  sigungucode?: string;
  firstimage?: string;
  mapx?: string;
  mapy?: string;
  tel?: string;
}

export interface TourapiArea {
  code: string;
  name: string;
}

@Injectable()
export class TourapiProvider {
  private readonly logger = new Logger(TourapiProvider.name);
  private readonly key: string;
  private readonly base: string;
  private readonly mobileApp = "MarketingIntelligence";
  private readonly mobileOs = "ETC";

  constructor(
    private config: ConfigService,
    private cache: CacheService,
  ) {
    this.key = this.config.get<string>("TOURAPI_KEY") || "";
    this.base =
      this.config.get<string>("TOURAPI_BASE") ||
      "https://apis.data.go.kr/B551011/KorService2";
  }

  isConfigured(): boolean {
    return this.key.length > 0;
  }

  /**
   * 행사/축제 검색.
   * @param opts.startDate YYYYMMDD (필수)
   * @param opts.endDate YYYYMMDD (옵션)
   * @param opts.areaCode 시도 코드 (옵션) — 예: "33" (충북)
   * @param opts.sigunguCode 시군구 코드 (옵션, areaCode 와 함께)
   * @param opts.numOfRows 페이지 당 (기본 50)
   */
  async searchFestivals(opts: {
    startDate: string;
    endDate?: string;
    areaCode?: string;
    sigunguCode?: string;
    numOfRows?: number;
    pageNo?: number;
  }): Promise<TourapiFestival[]> {
    if (!this.isConfigured()) throw new TourapiNotConfiguredError();

    // 캐시 키 — 동일 파라미터 24h 캐싱
    const cacheKey = `tourapi:festival:${opts.startDate}:${opts.endDate ?? "_"}:${opts.areaCode ?? "_"}:${opts.sigunguCode ?? "_"}:${opts.pageNo ?? 1}`;
    const cached = await this.cache.get<TourapiFestival[]>(cacheKey);
    if (cached) return cached;

    const params: Record<string, any> = {
      serviceKey: this.key,
      MobileOS: this.mobileOs,
      MobileApp: this.mobileApp,
      _type: "json",
      arrange: "C", // 수정일 순
      eventStartDate: opts.startDate,
      numOfRows: opts.numOfRows ?? 50,
      pageNo: opts.pageNo ?? 1,
    };
    if (opts.endDate) params.eventEndDate = opts.endDate;
    if (opts.areaCode) params.areaCode = opts.areaCode;
    if (opts.sigunguCode) params.sigunguCode = opts.sigunguCode;

    const url = `${this.base}/searchFestival2`;

    let resp;
    try {
      resp = await axios.get(url, {
        params,
        timeout: 15000,
        // serviceKey 가 이미 인코딩된 형태일 수 있어 paramsSerializer 로 raw 전달
        paramsSerializer: (p) =>
          Object.entries(p)
            .map(([k, v]) => `${k}=${v}`)
            .join("&"),
      });
    } catch (e: any) {
      throw new Error(`TourAPI 호출 실패: ${e?.response?.status ?? ""} ${e.message}`);
    }

    // 응답이 XML 이면 에러 (인증키 오류 등)
    if (typeof resp.data === "string" && resp.data.startsWith("<")) {
      throw new Error(
        `TourAPI 에러 응답 (XML): ${resp.data.slice(0, 300)} — 인증키 또는 파라미터 확인 필요`,
      );
    }

    const header = resp.data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
      throw new Error(
        `TourAPI 에러: ${header.resultCode} ${header.resultMsg ?? ""}`,
      );
    }

    const items = resp.data?.response?.body?.items?.item;
    const list: TourapiFestival[] = Array.isArray(items)
      ? items
      : items
        ? [items]
        : [];

    await this.cache.set(cacheKey, list, 86400);
    return list;
  }

  /**
   * 시도(광역) 코드 조회 — 캐싱.
   */
  async getAreaCodes(): Promise<TourapiArea[]> {
    if (!this.isConfigured()) throw new TourapiNotConfiguredError();
    const cached = await this.cache.get<TourapiArea[]>("tourapi:areacodes");
    if (cached) return cached;

    const params = {
      serviceKey: this.key,
      MobileOS: this.mobileOs,
      MobileApp: this.mobileApp,
      _type: "json",
      numOfRows: 50,
      pageNo: 1,
    };
    const resp = await axios.get(`${this.base}/areaCode2`, {
      params,
      timeout: 15000,
      paramsSerializer: (p) =>
        Object.entries(p)
          .map(([k, v]) => `${k}=${v}`)
          .join("&"),
    });
    const items = resp.data?.response?.body?.items?.item;
    const list: TourapiArea[] = (Array.isArray(items) ? items : items ? [items] : []).map(
      (i: any) => ({ code: String(i.code), name: String(i.name) }),
    );
    await this.cache.set("tourapi:areacodes", list, 86400 * 7);
    return list;
  }

  /**
   * 광역 이름으로 코드 조회 (예: '충북' → '33').
   * 부분 일치.
   */
  async resolveAreaCode(name: string): Promise<string | null> {
    if (!name) return null;
    try {
      const list = await this.getAreaCodes();
      const norm = name.replace(/\s+/g, "");
      // 정확 일치 우선
      const exact = list.find((a) => a.name === norm);
      if (exact) return exact.code;
      // 부분 일치
      const partial = list.find(
        (a) => norm.includes(a.name) || a.name.includes(norm),
      );
      return partial?.code ?? null;
    } catch (e: any) {
      this.logger.warn(`areaCode 조회 실패: ${e.message}`);
      return null;
    }
  }
}
