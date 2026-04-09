import { OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { QUEUES } from "../queue.constants";
import { ReviewService } from "../../modules/review/review.service";
import { PrismaService } from "../../common/prisma.service";
import { PushService } from "../../modules/notification/push.service";
import { QueueAlertService } from "../queue.listener";

@Processor(QUEUES.REVIEW)
export class ReviewProcessor {
  private readonly logger = new Logger(ReviewProcessor.name);

  constructor(
    private review: ReviewService,
    private prisma: PrismaService,
    private push: PushService,
    private alert: QueueAlertService,
  ) {}

  @OnQueueFailed()
  async onFailed(job: Job<{ storeId: string }>, err: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.alert.onJobFailed(
        QUEUES.REVIEW,
        job.name,
        job.data.storeId,
        err.message,
        job.attemptsMade,
      );
    }
  }

  @Process({ name: "fetch-and-draft", concurrency: 2 })
  async handle(job: Job<{ storeId: string }>) {
    const store = await this.prisma.store.findUnique({
      where: { id: job.data.storeId },
      select: { id: true, name: true, userId: true },
    });
    if (!store) throw new Error(`store ${job.data.storeId} not found`);

    this.logger.log(
      `[${job.id}] 리뷰 수집+초안 시작 store=${store.name} attempt=${job.attemptsMade + 1}`,
    );

    const fetched = await this.review.fetchReviews(store.id);
    const drafted = await this.review.draftReplies(store.id);

    this.logger.log(
      `[${job.id}] 리뷰 처리 완료 store=${store.name} fetched=${fetched} drafted=${drafted}`,
    );

    // 새 초안이 생성되면 사장님에게 검수 알림
    if (drafted > 0) {
      try {
        await this.push.sendToUser(store.userId, {
          title: `📝 ${store.name} 리뷰 답글 검수 ${drafted}건`,
          body: "AI가 작성한 답글 초안이 검수를 기다리고 있습니다",
          data: { storeId: store.id, type: "review_drafted", count: drafted },
          url: `/dashboard/reviews?store=${store.id}`,
        });
        await this.prisma.notification.create({
          data: {
            userId: store.userId,
            type: "REVIEW_DRAFTED",
            title: `${store.name} 리뷰 답글 검수 ${drafted}건`,
            message: `AI가 ${drafted}개의 답글 초안을 작성했습니다. 검수해주세요.`,
            data: { storeId: store.id, count: drafted },
          },
        });
      } catch (e: any) {
        this.logger.warn(`리뷰 알림 실패: ${e.message}`);
      }
    }

    return { storeId: store.id, fetched, drafted };
  }
}
