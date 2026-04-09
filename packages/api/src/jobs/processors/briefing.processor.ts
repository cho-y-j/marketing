import { OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { QUEUES } from "../queue.constants";
import { BriefingService } from "../../modules/briefing/briefing.service";
import { PrismaService } from "../../common/prisma.service";
import { PushService } from "../../modules/notification/push.service";
import { NotificationService } from "../../modules/notification/notification.service";
import { QueueAlertService } from "../queue.listener";

@Processor(QUEUES.BRIEFING)
export class BriefingProcessor {
  private readonly logger = new Logger(BriefingProcessor.name);

  constructor(
    private briefing: BriefingService,
    private prisma: PrismaService,
    private alert: QueueAlertService,
    private push: PushService,
    private notificationService: NotificationService,
  ) {}

  @OnQueueFailed()
  async onFailed(job: Job<{ storeId: string }>, err: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.alert.onJobFailed(
        QUEUES.BRIEFING,
        job.name,
        job.data.storeId,
        err.message,
        job.attemptsMade,
      );
    }
  }

  @Process({ name: "generate-briefing", concurrency: 1 })
  async handle(job: Job<{ storeId: string }>) {
    const store = await this.prisma.store.findUnique({
      where: { id: job.data.storeId },
      select: { id: true, name: true, userId: true },
    });
    if (!store) throw new Error(`store ${job.data.storeId} not found`);

    // 체인 가드: 오늘 분석 데이터 존재 확인
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todays = await this.prisma.storeAnalysis.findFirst({
      where: { storeId: store.id, analyzedAt: { gte: todayStart } },
    });
    if (!todays) {
      // 분석이 없으면 fail 처리 — 빈 브리핑 만들지 않음
      throw new Error("brief_skipped:오늘 분석 데이터가 없습니다");
    }

    this.logger.log(
      `[${job.id}] 브리핑 시작 store=${store.name} attempt=${job.attemptsMade + 1}`,
    );
    const result = await this.briefing.generateDailyBriefing(store.id);
    this.logger.log(`[${job.id}] 브리핑 완료 store=${store.name}`);

    // 브리핑 성공 → DB 알림 + 푸시 알림 (실패해도 잡 자체는 성공)
    try {
      await this.notificationService.createBriefingAlert(store.userId, store.name);
    } catch {}
    try {
      const actions = (result.actions as any[]) || [];
      const firstAction = actions[0]?.action || "오늘의 마케팅 액션을 확인하세요";
      const pushResult = await this.push.sendToUser(store.userId, {
        title: `☀️ ${store.name} 오늘의 브리핑`,
        body: firstAction,
        data: { storeId: store.id, briefingId: result.id },
        url: `/dashboard?store=${store.id}`,
      });
      this.logger.log(
        `[${job.id}] 푸시 발송 sent=${pushResult.sent} failed=${pushResult.failed}`,
      );
    } catch (e: any) {
      this.logger.warn(`[${job.id}] 푸시 발송 중 오류 (브리핑은 성공): ${e.message}`);
    }

    return { storeId: store.id, briefingId: result.id };
  }
}
