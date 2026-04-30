import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { IngredientPriceService } from "../modules/ingredient/ingredient-price.service";

/**
 * KAMIS 주재료 가격 수집 cron.
 * 매일 21:00 UTC (한국 06:00 AM) — KAMIS 데이터는 당일 오전에 업데이트됨.
 */
@Injectable()
export class IngredientPriceJob {
  private readonly logger = new Logger(IngredientPriceJob.name);

  constructor(private service: IngredientPriceService) {}

  @Cron("50 4 * * *") // UTC 04:50 = 한국 13:50 (사장님 룰 — 새벽엔 PC OFF)
  async runDaily() {
    this.logger.log("[13:50 KAMIS 가격 수집] 시작");
    try {
      const res = await this.service.collectDailyPrices();
      this.logger.log(`[13:50 KAMIS 가격 수집] 완료 — 수집 ${res.collected}, 알림 ${res.alerts}`);
    } catch (e: any) {
      this.logger.error(`[KAMIS 가격 수집] 실패: ${e.message}`);
    }
  }
}
