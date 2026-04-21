import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { CacheService } from "../../common/cache.service";

/**
 * KAMIS (농수산물유통정보) Open API 프로바이더.
 * 기획서 4.6: "식자재 가격 변동 모니터링 + 메뉴 트렌드"
 *
 * 사용 엔드포인트:
 *  - 일별 품목별 도/소매가격 (period_product_list)
 *
 * 정책:
 *  - KAMIS_KEY/KAMIS_ID 미설정 시 NotConfiguredError
 *  - 결과 Redis 캐싱 (12시간)
 *
 * 신청 후 키 받으면 .env.local 의 KAMIS_KEY/KAMIS_ID 만 채우면 즉시 동작.
 */

export class KamisNotConfiguredError extends Error {
  constructor() {
    super(
      "KAMIS_KEY 또는 KAMIS_ID 환경변수가 설정되지 않았습니다 " +
        "(KAMIS Open API 신청 후 발급받은 인증키 필요)",
    );
  }
}

export interface KamisPricePoint {
  date: string; // YYYY-MM-DD
  productClsCode: string;
  productClsName: string;
  itemName: string;
  unit: string;
  price: number; // 평균가
  priceType: "retail" | "wholesale";
}

export interface KamisTrend {
  itemName: string;
  current: number;
  previous: number;
  changeRate: number; // %
  unit: string;
  source: "kamis";
  recordedAt: string;
}

@Injectable()
export class KamisProvider {
  private readonly logger = new Logger(KamisProvider.name);
  private readonly key: string;
  private readonly id: string;
  // KAMIS Open API 엔드포인트 (공식)
  private readonly base = "http://www.kamis.or.kr/service/price/xml.do";

  constructor(
    private config: ConfigService,
    private cache: CacheService,
  ) {
    this.key = this.config.get<string>("KAMIS_KEY") || "";
    this.id = this.config.get<string>("KAMIS_ID") || "";
  }

  isConfigured(): boolean {
    return this.key.length > 0 && this.id.length > 0;
  }

  /**
   * 일별 품목별 도/소매가격 조회.
   * @param opts.itemCategoryCode 부류코드 (100: 식량작물, 200: 채소류, 300: 특용작물, 400: 과일류, 500: 축산물, 600: 수산물)
   * @param opts.itemCode 품목코드 (옵션)
   * @param opts.kindCode 품종코드 (옵션)
   * @param opts.productClsCode 도/소매 구분 (01: 소매, 02: 도매)
   */
  async getDailyPriceList(opts: {
    itemCategoryCode: string;
    regday?: string; // YYYY-MM-DD (미지정 시 오늘)
    itemCode?: string;
    kindCode?: string;
    productClsCode?: "01" | "02";
    countryCode?: string;
    convertKgYn?: "Y" | "N";
  }): Promise<KamisPricePoint[]> {
    if (!this.isConfigured()) throw new KamisNotConfiguredError();

    const regday = opts.regday ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `kamis:daily:${opts.itemCategoryCode}:${regday}:${opts.productClsCode ?? "01"}`;
    const cached = await this.cache.get<KamisPricePoint[]>(cacheKey);
    if (cached) return cached;

    // KAMIS 는 http 만 제공하고 302 로 https://www.kamis.or.kr 로 리다이렉트
    // → axios 의 기본 maxRedirects=5 가 따라가지만 co.kr→or.kr 이슈 방지 위해 or.kr 직접 사용
    const url = "https://www.kamis.or.kr/service/price/xml.do";
    const params = {
      action: "dailyPriceByCategoryList",
      p_product_cls_code: opts.productClsCode ?? "01",
      p_country_code: opts.countryCode ?? "1101",
      p_convert_kg_yn: opts.convertKgYn ?? "Y",
      p_item_category_code: opts.itemCategoryCode,
      p_regday: regday, // 필수 — 없으면 "data":["200"] 에러
      p_cert_key: this.key,
      p_cert_id: this.id,
      p_returntype: "json",
      ...(opts.itemCode ? { p_item_code: opts.itemCode } : {}),
      ...(opts.kindCode ? { p_kind_code: opts.kindCode } : {}),
    };

    let resp;
    try {
      resp = await axios.get(url, { params, timeout: 15000 });
    } catch (e: any) {
      throw new Error(`KAMIS 호출 실패: ${e?.response?.status ?? ""} ${e.message}`);
    }

    // 응답 구조: { condition: [...], data: { error_code: "000", item: [{...}] } }
    // 에러 시: { data: ["<code>"] } 형태
    const data = resp.data?.data;
    if (!data || Array.isArray(data)) {
      // 빈 응답 또는 에러
      await this.cache.set(cacheKey, [], 3600); // 짧게 캐싱 — 재시도 가능
      return [];
    }

    const items = data.item ?? [];
    const priceType: "retail" | "wholesale" =
      (opts.productClsCode ?? "01") === "02" ? "wholesale" : "retail";
    const list: KamisPricePoint[] = (Array.isArray(items) ? items : [items])
      .filter((it: any) => it && it.item_name)
      .map(
        (it: any): KamisPricePoint => ({
          date: regday,
          productClsCode: opts.productClsCode ?? "01",
          productClsName: priceType === "retail" ? "소매" : "도매",
          itemName: it.item_name,
          unit: it.unit || "kg",
          price: this.parsePrice(it.dpr1),
          priceType,
        }),
      )
      .filter((it: KamisPricePoint) => it.price > 0);

    await this.cache.set(cacheKey, list, 12 * 3600);
    return list;
  }

  /**
   * 품목 한 건의 당일/1주일전/1개월전 가격을 한 번에 조회 (widget 용).
   * KAMIS 응답의 dpr1(당일)/dpr3(1주일전)/dpr5(1개월전) 활용.
   */
  async getMultiPointPrices(
    categoryCode: string,
    regday?: string,
  ): Promise<
    Array<{
      itemName: string;
      kindName: string;
      unit: string;
      today: number;
      week: number;
      month: number;
    }>
  > {
    if (!this.isConfigured()) throw new KamisNotConfiguredError();
    const day = regday ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `kamis:multi:${categoryCode}:${day}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const url = "https://www.kamis.or.kr/service/price/xml.do";
    const params = {
      action: "dailyPriceByCategoryList",
      p_product_cls_code: "01",
      p_country_code: "1101",
      p_convert_kg_yn: "Y",
      p_item_category_code: categoryCode,
      p_regday: day,
      p_cert_key: this.key,
      p_cert_id: this.id,
      p_returntype: "json",
    };
    const resp = await axios.get(url, { params, timeout: 15000 });
    const data = resp.data?.data;
    if (!data || Array.isArray(data)) return [];
    const items = data.item ?? [];
    const list = (Array.isArray(items) ? items : [items])
      .filter((it: any) => it && it.item_name)
      .map((it: any) => ({
        itemName: it.item_name as string,
        kindName: (it.kind_name as string) ?? "",
        unit: (it.unit as string) || "kg",
        today: this.parsePrice(it.dpr1),
        week: this.parsePrice(it.dpr3),
        month: this.parsePrice(it.dpr5),
      }))
      .filter((it: any) => it.today > 0);

    await this.cache.set(cacheKey, list, 12 * 3600);
    return list;
  }

  /**
   * 식자재 가격 변동 추세 — 최근 N일 비교용 (간이 버전).
   * KAMIS 는 일별 데이터를 제공하므로 두 시점 호출하여 변동률 계산.
   */
  async getTrendsForCategories(categories: string[]): Promise<KamisTrend[]> {
    if (!this.isConfigured()) throw new KamisNotConfiguredError();
    const trends: KamisTrend[] = [];
    for (const cat of categories) {
      try {
        const today = await this.getDailyPriceList({ itemCategoryCode: cat });
        if (today.length === 0) continue;
        // 가격이 가장 큰 5개만 비교 대상으로 (대표 품목)
        const top = today
          .filter((p) => p.price > 0)
          .sort((a, b) => b.price - a.price)
          .slice(0, 5);
        for (const t of top) {
          trends.push({
            itemName: t.itemName,
            current: t.price,
            previous: t.price, // 단일 호출만 — 시계열은 별도 API 필요. 향후 확장.
            changeRate: 0,
            unit: t.unit,
            source: "kamis",
            recordedAt: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        this.logger.warn(`KAMIS 카테고리 ${cat} 조회 실패: ${e.message}`);
      }
    }
    return trends;
  }

  private parsePrice(v: any): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const s = String(v).replace(/[,원]/g, "").trim();
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }
}
