import { BullModule } from "@nestjs/bull";
import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BatchAnalysisJob } from "./batch-analysis.job";
import { BriefingGenerationJob } from "./briefing-generation.job";
import { ReviewBatchJob } from "./review-batch.job";
import { CompetitorRefreshJob } from "./competitor-refresh.job";
import { KeywordManagementJob } from "./keyword-management.job";
import { EffectMeasurementJob } from "./effect-measurement.job";
import { WeeklyReportJob } from "./weekly-report.job";
import { IngredientPriceJob } from "./ingredient-price.job";
import { AnalysisProcessor } from "./processors/analysis.processor";
import { RankCheckProcessor } from "./processors/rank-check.processor";
import { BriefingProcessor } from "./processors/briefing.processor";
import { ReviewProcessor } from "./processors/review.processor";
import { QueueAlertService } from "./queue.listener";
import { QUEUES } from "./queue.constants";
import { AnalysisModule } from "../modules/analysis/analysis.module";
import { BriefingModule } from "../modules/briefing/briefing.module";
import { KeywordModule } from "../modules/keyword/keyword.module";
import { ReviewModule } from "../modules/review/review.module";
import { DataModule } from "../providers/data/data.module";
import { CompetitorModule } from "../modules/competitor/competitor.module";
import { IngredientModule } from "../modules/ingredient/ingredient.module";

/**
 * Bull 큐 + 배치 cron 모듈.
 *
 * 큐: ANALYSIS, RANK_CHECK, BRIEFING (REVIEW_REPLY 는 추후 추가)
 * Redis 연결: REDIS_URL 환경변수 필요. 미설정 시 기동 실패 — 의도적임
 *  (껍데기 큐 대신 명시적 실패. 로컬 개발은 docker-compose redis 6382 사용).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL");
        if (!url) {
          throw new Error(
            "REDIS_URL 미설정 — Bull 큐는 Redis 가 필수입니다. " +
              "docker-compose up redis 또는 운영 Redis URL 을 설정해주세요.",
          );
        }
        return {
          url,
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.ANALYSIS },
      // 순위 체크는 IP 차단 누적 방지를 위해 매장 간 30초 쿨다운 — 동시에 한 건만 처리.
      // 매장 2개 연달아 등록해도 큐가 직렬화 + 30s 인터벌 강제.
      // lockDuration 5분: 매장당 키워드 N개 × pcmap 호출(키워드당 1~2초) 합산이
      // Bull 기본 30초 lock 을 넘겨 stalled 처리되던 문제 — 4-27~4-29 4건 stalled 누적.
      {
        name: QUEUES.RANK_CHECK,
        limiter: { max: 1, duration: 30_000 },
        settings: { lockDuration: 300_000, lockRenewTime: 60_000, stalledInterval: 60_000 },
      },
      { name: QUEUES.BRIEFING },
      { name: QUEUES.REVIEW },
    ),
    AnalysisModule,
    BriefingModule,
    KeywordModule,
    ReviewModule,
    // 순환 의존: DataModule.StoreSetupService 가 BatchAnalysisJob 을 주입받아 enqueueRankCheckManual 호출.
    // DataModule 쪽도 forwardRef(() => JobsModule) 로 import — 양쪽 forwardRef 필수.
    forwardRef(() => DataModule),
    CompetitorModule,
    IngredientModule,
  ],
  providers: [
    BatchAnalysisJob,
    BriefingGenerationJob,
    ReviewBatchJob,
    CompetitorRefreshJob,
    KeywordManagementJob,
    EffectMeasurementJob,
    WeeklyReportJob,
    IngredientPriceJob,
    AnalysisProcessor,
    RankCheckProcessor,
    BriefingProcessor,
    ReviewProcessor,
    QueueAlertService,
  ],
  exports: [BatchAnalysisJob, BriefingGenerationJob, ReviewBatchJob, CompetitorRefreshJob, KeywordManagementJob],
})
export class JobsModule {}
