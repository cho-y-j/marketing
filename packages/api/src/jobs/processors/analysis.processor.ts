import { OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { QUEUES } from "../queue.constants";
import { AnalysisService } from "../../modules/analysis/analysis.service";
import { DataCollectorService } from "../../providers/data/data-collector.service";
import { PrismaService } from "../../common/prisma.service";
import { QueueAlertService } from "../queue.listener";

/**
 * 매장 분석 큐 프로세서.
 * job.data: { storeId: string, source: 'cron' | 'manual' }
 *
 * 설계:
 *  - 데이터 수집 → AI 분석 순차 (한 매장 내에서)
 *  - 매장 단위로 큐에 들어가므로 매장 간 병렬 처리 자연스러움
 *  - 실패 시 Bull 의 attempts 옵션으로 재시도
 *  - 재시도 모두 실패하면 사용자에게 알림 작성 (껍데기 0 으로 채우는 짓 금지)
 */
@Processor(QUEUES.ANALYSIS)
export class AnalysisProcessor {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private dataCollector: DataCollectorService,
    private analysisService: AnalysisService,
    private prisma: PrismaService,
    private alert: QueueAlertService,
  ) {}

  @OnQueueFailed()
  async onFailed(job: Job<{ storeId: string }>, err: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.alert.onJobFailed(
        QUEUES.ANALYSIS,
        job.name,
        job.data.storeId,
        err.message,
        job.attemptsMade,
      );
    }
  }

  @Process({ name: "analyze-store", concurrency: 1 })
  async handle(job: Job<{ storeId: string; source: string }>) {
    const { storeId, source } = job.data;
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, userId: true },
    });
    if (!store) {
      throw new Error(`store ${storeId} not found`);
    }

    this.logger.log(
      `[${job.id}] 분석 시작 store=${store.name} source=${source} attempt=${job.attemptsMade + 1}`,
    );

    await this.dataCollector.collectDailyUpdate(storeId);
    const result = await this.analysisService.analyzeStore(storeId);

    this.logger.log(
      `[${job.id}] 분석 완료 store=${store.name} score=${result.competitiveScore}`,
    );
    return { storeId, score: result.competitiveScore };
  }
}
