import { InjectQueue } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Queue } from "bull";
import { PrismaService } from "../common/prisma.service";
import { findAutoAnalysisStores } from "../common/helpers/auto-analysis-targets.helper";
import { QUEUES } from "./queue.constants";

/**
 * 06:00 브리핑 생성 enqueue.
 * 4시 분석/5시 순위가 끝난 후 실행되는 체인의 마지막 단계.
 *
 * 체인 가드는 BriefingProcessor 안에서 수행 (오늘 분석 데이터 존재 확인).
 * 분석 데이터 없으면 fail → 모든 attempts 소진 후 사용자 알림.
 */
@Injectable()
export class BriefingGenerationJob {
  private readonly logger = new Logger(BriefingGenerationJob.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUES.BRIEFING) private briefingQueue: Queue,
  ) {}

  @Cron("35 4 * * *") // UTC 04:35 = 한국 13:35
  async enqueueDailyBriefings() {
    const stores = await findAutoAnalysisStores(this.prisma, { caller: "BriefingGenerationJob" });
    this.logger.log(`[13:35] 브리핑 enqueue 대상 ${stores.length}개`);

    for (const store of stores) {
      await this.briefingQueue.add(
        "generate-briefing",
        { storeId: store.id },
        {
          // 분석 데이터 부재로 인한 일시적 실패 대비 — 5분, 15분 간격 재시도
          attempts: 3,
          backoff: { type: "fixed", delay: 5 * 60 * 1000 },
          removeOnComplete: 100,
          removeOnFail: 200,
          jobId: `cron:briefing:${store.id}:${this.todayKey()}`,
        },
      );
    }
  }

  /** 수동 트리거 */
  async enqueueBriefingManual(storeId: string) {
    return this.briefingQueue.add(
      "generate-briefing",
      { storeId },
      {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
  }

  private todayKey(): string {
    return new Date().toISOString().split("T")[0];
  }
}
