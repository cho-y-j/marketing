import { InjectQueue, OnQueueFailed, Processor } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Queue, Job } from "bull";
import { QUEUES } from "./queue.constants";
import { PrismaService } from "../common/prisma.service";

/**
 * 큐 실패 알림 리스너.
 * 모든 attempts 소진 후 호출되어 사용자에게 명시적 알림 작성.
 *
 * Bull-NestJS 의 OnQueueFailed 데코레이터는 같은 큐의 @Processor 클래스에 있어야 동작.
 * 따라서 각 프로세서별로 OnQueueFailed 를 추가하는 게 정석.
 * 여기서는 공통 알림 함수를 export 해서 각 프로세서에서 호출하도록 한다.
 */

@Injectable()
export class QueueAlertService {
  private readonly logger = new Logger(QueueAlertService.name);

  constructor(private prisma: PrismaService) {}

  /** 큐 잡 최종 실패 시 사용자 알림 작성 */
  async onJobFailed(
    queueName: string,
    jobName: string,
    storeId: string,
    error: string,
    attempts: number,
  ): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, name: true },
    });
    if (!store) return;

    const isSkip = error?.startsWith("brief_skipped:");
    const cleanError = isSkip ? error.replace("brief_skipped:", "") : error;

    await this.prisma.notification.create({
      data: {
        userId: store.userId,
        type: isSkip ? `${queueName.toUpperCase()}_SKIPPED` : `${queueName.toUpperCase()}_FAILED`,
        title: isSkip
          ? `[${store.name}] ${queueName} 자동 실행 스킵`
          : `[${store.name}] ${queueName} 자동 실행 실패`,
        message: `${cleanError} (시도 ${attempts}회)`,
        data: { storeId, queueName, jobName, error: cleanError, attempts },
      },
    });
    this.logger.warn(
      `[${queueName}/${jobName}] 최종 실패 → 사용자 알림 작성됨 store=${store.name}: ${cleanError}`,
    );
  }
}
