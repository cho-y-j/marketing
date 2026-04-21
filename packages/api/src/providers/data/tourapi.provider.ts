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
  lDongRegnCd?: string;
  lDongSignguCd?: string;
  firstimage?: string;
  mapx?: string;
  mapy?: string;
  tel?: string;
}

export interface TourapiArea {
  code: string;
  name: string;
}

// 시도 → 법정동 시도 코드 (lDongRegnCd)
// TourAPI v2 의 lDong 필터는 표준 법정동 코드 사용 (areaCode 와 다른 체계)
const SIDO_TO_LDONG_REGN: Record<string, string> = {
  서울: "11", 서울특별시: "11",
  부산: "26", 부산광역시: "26",
  대구: "27", 대구광역시: "27",
  인천: "28", 인천광역시: "28",
  광주: "29", 광주광역시: "29",
  대전: "30", 대전광역시: "30",
  울산: "31", 울산광역시: "31",
  세종: "36", 세종특별자치시: "36",
  경기: "41", 경기도: "41",
  강원: "51", 강원특별자치도: "51", 강원도: "51",
  충북: "43", 충청북도: "43",
  충남: "44", 충청남도: "44",
  전북: "52", 전북특별자치도: "52", 전라북도: "52",
  전남: "46", 전라남도: "46",
  경북: "47", 경상북도: "47",
  경남: "48", 경상남도: "48",
  제주: "50", 제주특별자치도: "50",
};

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
    lDongRegnCd?: string;
    lDongSignguCd?: string;
    numOfRows?: number;
    pageNo?: number;
  }): Promise<TourapiFestival[]> {
    if (!this.isConfigured()) throw new TourapiNotConfiguredError();

    const cacheKey = `tourapi:festival:${opts.startDate}:${opts.endDate ?? "_"}:${opts.areaCode ?? "_"}:${opts.sigunguCode ?? "_"}:${opts.lDongRegnCd ?? "_"}:${opts.lDongSignguCd ?? "_"}:${opts.pageNo ?? 1}`;
    const cached = await this.cache.get<TourapiFestival[]>(cacheKey);
    if (cached) return cached;

    const params: Record<string, any> = {
      serviceKey: this.key,
      MobileOS: this.mobileOs,
      MobileApp: this.mobileApp,
      _type: "json",
      arrange: "C",
      eventStartDate: opts.startDate,
      numOfRows: opts.numOfRows ?? 50,
      pageNo: opts.pageNo ?? 1,
    };
    if (opts.endDate) params.eventEndDate = opts.endDate;
    if (opts.areaCode) params.areaCode = opts.areaCode;
    if (opts.sigunguCode) params.sigunguCode = opts.sigunguCode;
    if (opts.lDongRegnCd) params.lDongRegnCd = opts.lDongRegnCd;
    if (opts.lDongSignguCd) params.lDongSignguCd = opts.lDongSignguCd;

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
  /**
   * 시도의 하위 시군구 법정동 코드 조회 (ldongCode2).
   * 예: lDongRegnCd=43 (충북) → [{code:"800", name:"단양군"}, {code:"750", name:"진천군"}, ...]
   */
  async getLdongSignguCodes(lDongRegnCd: string): Promise<TourapiArea[]> {
    if (!this.isConfigured()) throw new TourapiNotConfiguredError();
    const cacheKey = `tourapi:ldong:${lDongRegnCd}`;
    const cached = await this.cache.get<TourapiArea[]>(cacheKey);
    if (cached) return cached;

    const params = {
      serviceKey: this.key,
      MobileOS: this.mobileOs,
      MobileApp: this.mobileApp,
      _type: "json",
      numOfRows: 100,
      pageNo: 1,
      lDongRegnCd,
    };
    const resp = await axios.get(`${this.base}/ldongCode2`, {
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
    await this.cache.set(cacheKey, list, 86400 * 7);
    return list;
  }

  /**
   * 주소 문자열에서 법정동 시도/시군구 코드 쌍 추출.
   * 예: "충북 단양군 단양읍" → { regn: "43", signgu: "800" }
   *     "서울 마포구 도화동" → { regn: "11", signgu: "440" }
   */
  async resolveLdongCodes(
    address: string,
  ): Promise<{ regn: string | null; signgu: string | null; regnName: string; signguName: string }> {
    const parts = address.split(/\s+/).filter(Boolean);
    // 시도 추출
    let sido = "";
    for (const p of parts) {
      if (SIDO_TO_LDONG_REGN[p]) { sido = p; break; }
      // "충북" → "충북" 같이 앞부분 접두 매칭
      const shortKey = Object.keys(SIDO_TO_LDONG_REGN).find((k) => p.startsWith(k) || k.startsWith(p));
      if (shortKey) { sido = shortKey; break; }
    }
    const regn = sido ? SIDO_TO_LDONG_REGN[sido] : null;
    if (!regn) {
      return { regn: null, signgu: null, regnName: "", signguName: "" };
    }

    // 시군구 추출 — 주소에서 "XX군"/"XX시"/"XX구" 형태 찾기
    let sigunguName = "";
    for (const p of parts) {
      if (/(군|시|구)$/.test(p) && p.length >= 2 && !SIDO_TO_LDONG_REGN[p]) {
        sigunguName = p;
        break;
      }
    }
    if (!sigunguName) return { regn, signgu: null, regnName: sido, signguName: "" };

    // ldongCode2 로 코드 조회
    try {
      const list = await this.getLdongSignguCodes(regn);
      // 정확 일치
      let hit = list.find((a) => a.name === sigunguName);
      // 부분 일치 (예: "청주시 청원구"는 "청주시" 매장 주소에선 못 찾을 수 있음)
      if (!hit) hit = list.find((a) => a.name.startsWith(sigunguName) || sigunguName.startsWith(a.name));
      return {
        regn,
        signgu: hit?.code ?? null,
        regnName: sido,
        signguName: hit?.name ?? sigunguName,
      };
    } catch (e: any) {
      this.logger.warn(`시군구 조회 실패 (${sido}): ${e.message}`);
      return { regn, signgu: null, regnName: sido, signguName: sigunguName };
    }
  }

  async resolveAreaCode(name: string): Promise<string | null> {
    if (!name) return null;
    // 짧은 표기 → 정식명 매핑 (TourAPI areaCode 는 정식명 기준)
    const shortToFull: Record<string, string> = {
      충북: "충청북도", 충남: "충청남도",
      전북: "전라북도", 전남: "전라남도",
      경북: "경상북도", 경남: "경상남도",
      경기: "경기도", 강원: "강원특별자치도",
      서울: "서울특별시", 부산: "부산광역시",
      대구: "대구광역시", 인천: "인천광역시",
      광주: "광주광역시", 대전: "대전광역시",
      울산: "울산광역시", 세종: "세종특별자치시",
      제주: "제주특별자치도",
    };
    try {
      const list = await this.getAreaCodes();
      const norm = name.replace(/\s+/g, "");
      const candidates = [norm, shortToFull[norm]].filter(Boolean) as string[];
      for (const c of candidates) {
        const exact = list.find((a) => a.name === c);
        if (exact) return exact.code;
      }
      // 부분 일치
      const partial = list.find((a) =>
        candidates.some((c) => c.includes(a.name) || a.name.includes(c)),
      );
      return partial?.code ?? null;
    } catch (e: any) {
      this.logger.warn(`areaCode 조회 실패: ${e.message}`);
      return null;
    }
  }
}
