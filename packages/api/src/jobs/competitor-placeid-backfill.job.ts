import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CompetitorService } from "../modules/competitor/competitor.service";

/**
 * 경쟁사 placeId NULL 재보강 cron.
 *
 * 경쟁사 추가 시 네이버 검색 결과가 없어 placeId 를 못 얻은 경우, 다음날
 * 다시 시도 (검색 결과 캐시 변경·일시적 차단 복구 등을 기대).
 *
 * 매일 02:00 — 분석(04:00) 전에 실행되어 당일 분석에 반영되도록.
 */
@Injectable()
export class CompetitorPlaceIdBackfillJob {
  private readonly logger = new Logger(CompetitorPlaceIdBackfillJob.name);

  constructor(private competitorService: CompetitorService) {}

  @Cron("5 4 * * *") // UTC 04:05 = 한국 13:05 (DailySnapshot 직후)
  async backfill() {
    this.logger.log(`[13:05] 경쟁사 placeId 재보강 시작`);
    const result = await this.competitorService.backfillNullPlaceIds();
    this.logger.log(
      `[13:05] 경쟁사 placeId 재보강 완료 — 전체 ${result.total}건, 확보 ${result.filled}건, 미확보 ${result.stillMissing.length}건`,
    );
    if (result.stillMissing.length > 0) {
      this.logger.warn(
        `[02시] placeId 미확보 매장: ${result.stillMissing.join(", ")}`,
      );
    }
  }
}
