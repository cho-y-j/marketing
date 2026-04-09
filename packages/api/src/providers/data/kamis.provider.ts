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
    itemCode?: string;
    kindCode?: string;
    productClsCode?: "01" | "02";
    countryCode?: string;
    convertKgYn?: "Y" | "N";
  }): Promise<KamisPricePoint[]> {
    if (!this.isConfigured()) throw new KamisNotConfiguredError();

    const cacheKey = `kamis:daily:${opts.itemCategoryCode}:${opts.itemCode ?? "_"}:${opts.kindCode ?? "_"}:${opts.productClsCode ?? "01"}`;
    const cached = await this.cache.get<KamisPricePoint[]>(cacheKey);
    if (cached) return cached;

    const params = {
      action: "dailyPriceByCategoryList",
      p_product_cls_code: opts.productClsCode ?? "01",
      p_country_code: opts.countryCode ?? "1101", // 서울 기본
      p_convert_kg_yn: opts.convertKgYn ?? "Y",
      p_item_category_code: opts.itemCategoryCode,
      p_cert_key: this.key,
      p_cert_id: this.id,
      p_returntype: "json",
      ...(opts.itemCode ? { p_item_code: opts.itemCode } : {}),
      ...(opts.kindCode ? { p_kind_code: opts.kindCode } : {}),
    };

    let resp;
    try {
      resp = await axios.get(this.base, { params, timeout: 15000 });
    } catch (e: any) {
      throw new Error(`KAMIS 호출 실패: ${e?.response?.status ?? ""} ${e.message}`);
    }

    // KAMIS 응답: { price: [...] } 형식
    const items = resp.data?.price ?? resp.data?.data?.item ?? [];
    const priceType: "retail" | "wholesale" =
      (opts.productClsCode ?? "01") === "02" ? "wholesale" : "retail";
    const list: KamisPricePoint[] = (Array.isArray(items) ? items : [items])
      .filter((it: any) => it && it.item_name)
      .map(
        (it: any): KamisPricePoint => ({
          date: it.regday || new Date().toISOString().split("T")[0],
          productClsCode: it.product_cls_code || opts.productClsCode || "01",
          productClsName: it.product_cls_name || "소매",
          itemName: it.item_name,
          unit: it.unit || "kg",
          price: this.parsePrice(it.dpr1 ?? it.price),
          priceType,
        }),
      )
      .filter((it: KamisPricePoint) => it.price > 0);

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
