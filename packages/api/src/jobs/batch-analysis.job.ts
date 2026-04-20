import { InjectQueue } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Queue } from "bull";
import { PrismaService } from "../common/prisma.service";
import { findAutoAnalysisStores } from "../common/helpers/auto-analysis-targets.helper";
import { QUEUES } from "./queue.constants";

/**
 * 새벽 배치 — Cron 은 enqueue 만 담당.
 * 실제 작업은 Bull 큐 프로세서가 순차 실행.
 *
 * === 시간 분산 전략 ===
 * CLI 기반이므로 동시 실행하면 시스템 과부하.
 * 각 매장에 delay를 줘서 04:00~05:00 사이에 분산.
 * 예: 100명이면 매장 간 36초 간격 → 1시간에 전부 처리.
 *
 * 시간표:
 *  - 04:00~05:00  분석 (매장별 시차 enqueue)
 *  - 05:00~06:00  순위 체크 (매장별 시차 enqueue)
 *  - 06:00        브리핑 생성
 */
@Injectable()
export class BatchAnalysisJob {
  private readonly logger = new Logger(BatchAnalysisJob.name);

  // 동시 처리 상한 — CLI 기반이므로 낮게
  private readonly SPREAD_WINDOW_MS = 60 * 60 * 1000; // 1시간에 분산

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUES.ANALYSIS) private analysisQueue: Queue,
    @InjectQueue(QUEUES.RANK_CHECK) private rankQueue: Queue,
  ) {}

  // 04:00 분석 enqueue (시차 분산)
  @Cron("0 4 * * *")
  async enqueueDailyAnalysis() {
    const stores = await this.getActiveStores();
    this.logger.log(`[04시] 분석 enqueue 대상 ${stores.length}개 (${this.calcInterval(stores.length)}초 간격)`);

    const interval = this.calcInterval(stores.length);

    for (let i = 0; i < stores.length; i++) {
      const delay = i * interval * 1000; // ms
      await this.analysisQueue.add(
        "analyze-store",
        { storeId: stores[i].id, source: "cron" },
        {
          delay,
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: 100,
          removeOnFail: 200,
          jobId: `cron:analysis:${stores[i].id}:${this.todayKey()}`,
        },
      );
    }
  }

  // 05:00 순위 체크 enqueue (시차 분산)
  @Cron("0 5 * * *")
  async enqueueDailyRankCheck() {
    const stores = await this.getActiveStores();
    this.logger.log(`[05시] 순위 체크 enqueue 대상 ${stores.length}개 (${this.calcInterval(stores.length)}초 간격)`);

    const interval = this.calcInterval(stores.length);

    for (let i = 0; i < stores.length; i++) {
      const delay = i * interval * 1000;
      await this.rankQueue.add(
        "check-store-ranks",
        { storeId: stores[i].id },
        {
          delay,
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 200,
          jobId: `cron:rank:${stores[i].id}:${this.todayKey()}`,
        },
      );
    }
  }

  /**
   * 수동 트리거 — delay 없이 즉시 실행
   */
  async enqueueAnalysisManual(storeId: string) {
    return this.analysisQueue.add(
      "analyze-store",
      { storeId, source: "manual" },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
  }

  private async getActiveStores() {
    return findAutoAnalysisStores(this.prisma, { caller: "BatchAnalysisJob" });
  }

  // 매장 수에 따른 간격(초) 계산: 1시간 안에 전부 분산
  private calcInterval(storeCount: number): number {
    if (storeCount <= 1) return 0;
    const totalSeconds = this.SPREAD_WINDOW_MS / 1000;
    return Math.max(10, Math.floor(totalSeconds / storeCount)); // 최소 10초 간격
  }

  private todayKey(): string {
    return new Date().toISOString().split("T")[0];
  }
}
