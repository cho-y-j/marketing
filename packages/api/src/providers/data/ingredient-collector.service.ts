import { Injectable, Logger } from "@nestjs/common";
import {
  KamisProvider,
  KamisNotConfiguredError,
  KamisTrend,
} from "./kamis.provider";

/**
 * 식자재 트렌드 수집기.
 * 매장 카테고리에 따라 KAMIS 부류 코드를 매핑하고 가격 수집.
 *
 * 기획서 4.6 — 식자재 가격 변동 모니터링.
 */
@Injectable()
export class IngredientCollectorService {
  private readonly logger = new Logger(IngredientCollectorService.name);

  /**
   * KAMIS 부류 코드:
   *  100 식량작물 / 200 채소류 / 300 특용작물 / 400 과일류 / 500 축산물 / 600 수산물
   */
  private categoryMap: Record<string, string[]> = {
    한식: ["100", "200", "500"],
    분식: ["100", "200"],
    중식: ["100", "200", "500"],
    일식: ["600", "200"],
    양식: ["500", "200", "400"],
    카페: ["400", "300"],
    빵집: ["100", "300"],
    고깃집: ["500"],
    회: ["600"],
    수산: ["600"],
    꼼장어: ["600"],
    장어: ["600"],
    해산물: ["600"],
    "조개": ["600"],
    과일: ["400"],
    채소: ["200"],
  };

  constructor(private kamis: KamisProvider) {}

  /**
   * 매장 카테고리에 맞는 식자재 가격 트렌드 반환.
   * @throws KamisNotConfiguredError 키 미설정 시 (껍데기 폴백 금지)
   */
  async getTrendsForStore(storeCategory: string | null | undefined): Promise<KamisTrend[]> {
    if (!this.kamis.isConfigured()) {
      throw new KamisNotConfiguredError();
    }
    const codes = this.resolveCategoryCodes(storeCategory ?? "");
    this.logger.log(
      `식자재 카테고리 매핑: '${storeCategory}' → [${codes.join(", ")}]`,
    );
    return this.kamis.getTrendsForCategories(codes);
  }

  /**
   * 매장 카테고리에 매칭되는 KAMIS 부류 코드 추출.
   * 매칭 실패 시 가장 일반적인 부류로 폴백.
   */
  private resolveCategoryCodes(category: string): string[] {
    if (!category) return ["200", "500"]; // 채소 + 축산
    const codes = new Set<string>();
    for (const [key, vals] of Object.entries(this.categoryMap)) {
      if (category.includes(key)) {
        for (const v of vals) codes.add(v);
      }
    }
    if (codes.size === 0) {
      // 알 수 없는 카테고리 → 채소+축산+수산
      return ["200", "500", "600"];
    }
    return Array.from(codes);
  }
}
