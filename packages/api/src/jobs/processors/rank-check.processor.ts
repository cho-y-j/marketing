import { OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { QUEUES } from "../queue.constants";
import { RankCheckService } from "../../modules/keyword/rank-check.service";
import { PrismaService } from "../../common/prisma.service";
import { QueueAlertService } from "../queue.listener";

@Processor(QUEUES.RANK_CHECK)
export class RankCheckProcessor {
  private readonly logger = new Logger(RankCheckProcessor.name);

  constructor(
    private rankCheck: RankCheckService,
    private prisma: PrismaService,
    private alert: QueueAlertService,
  ) {}

  @OnQueueFailed()
  async onFailed(job: Job<{ storeId: string }>, err: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.alert.onJobFailed(
        QUEUES.RANK_CHECK,
        job.name,
        job.data.storeId,
        err.message,
        job.attemptsMade,
      );
    }
  }

  // concurrency=1: 동시에 한 매장만 처리 — 같은 IP 에서 두 매장의 페이지네이션이
  // 겹치면 차단 누적. 매장 2개 연달아 등록 → 순차 처리 + 매장 간 30s 쿨다운(limiter).
  @Process({ name: "check-store-ranks", concurrency: 1 })
  async handle(job: Job<{ storeId: string }>) {
    const store = await this.prisma.store.findUnique({
      where: { id: job.data.storeId },
      select: { id: true, name: true },
    });
    if (!store) throw new Error(`store ${job.data.storeId} not found`);

    this.logger.log(
      `[${job.id}] 순위 체크 시작 store=${store.name} attempt=${job.attemptsMade + 1}`,
    );
    await this.rankCheck.checkAllKeywordRanks(store.id);
    this.logger.log(`[${job.id}] 순위 체크 완료 store=${store.name}`);
    return { storeId: store.id };
  }
}
