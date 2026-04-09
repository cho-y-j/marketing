import { InjectQueue } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Queue } from "bull";
import { PrismaService } from "../common/prisma.service";
import { QUEUES } from "./queue.constants";

/**
 * 리뷰 수집 + AI 답글 초안 작성 배치.
 * 매일 03:00 (분석/순위/브리핑 체인 시작 전).
 *
 * 자동 게시 X — 사장님 검수 후 수동 게시.
 */
@Injectable()
export class ReviewBatchJob {
  private readonly logger = new Logger(ReviewBatchJob.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUES.REVIEW) private queue: Queue,
  ) {}

  @Cron("0 3 * * *")
  async enqueueDailyReviewFetch() {
    const stores = await this.prisma.store.findMany({
      where: {
        user: { subscriptionPlan: { not: "FREE" } },
        naverPlaceId: { not: null },
      },
      select: { id: true, name: true },
    });
    this.logger.log(`[03시] 리뷰 수집+초안 enqueue 대상 ${stores.length}개`);
    for (const store of stores) {
      await this.queue.add(
        "fetch-and-draft",
        { storeId: store.id },
        {
          attempts: 2,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: 100,
          removeOnFail: 200,
          jobId: `cron:review:${store.id}:${this.todayKey()}`,
        },
      );
    }
  }

  /** 수동 트리거 */
  async enqueueManual(storeId: string) {
    return this.queue.add(
      "fetch-and-draft",
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
