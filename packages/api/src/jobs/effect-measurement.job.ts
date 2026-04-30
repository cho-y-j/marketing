import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ActionTrackingService } from "../modules/analysis/action-tracking.service";

/**
 * 액션 효과 측정 배치잡.
 * 매일 07:00 — 브리핑(06:00) 후.
 * 7일 이상 지난 미측정 액션의 효과를 자동 측정.
 */
@Injectable()
export class EffectMeasurementJob {
  private readonly logger = new Logger(EffectMeasurementJob.name);

  constructor(private actionTracking: ActionTrackingService) {}

  @Cron("40 4 * * *") // UTC 04:40 = 한국 13:40
  async measureDailyEffects() {
    this.logger.log("[13:40] 액션 효과 측정 시작");
    const result = await this.actionTracking.measurePendingEffects();
    this.logger.log(`[13:40] 액션 효과 측정 완료: ${result.measured}/${result.total}건`);
  }
}
