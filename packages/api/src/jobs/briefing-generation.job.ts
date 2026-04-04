import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.service";
import { BriefingService } from "../modules/briefing/briefing.service";

@Injectable()
export class BriefingGenerationJob {
  private readonly logger = new Logger(BriefingGenerationJob.name);

  constructor(
    private prisma: PrismaService,
    private briefingService: BriefingService,
  ) {}

  // 매일 새벽 6시 실행 (분석 완료 후)
  @Cron("0 6 * * *")
  async generateAllBriefings() {
    this.logger.log("=== 일일 브리핑 생성 시작 ===");

    const stores = await this.prisma.store.findMany({
      where: { user: { subscriptionPlan: { not: "FREE" } } },
    });

    this.logger.log(`대상 매장: ${stores.length}개`);

    for (const store of stores) {
      try {
        await this.briefingService.generateDailyBriefing(store.id);
        this.logger.log(`브리핑 생성: ${store.name}`);
      } catch (e: any) {
        this.logger.error(`브리핑 실패 [${store.name}]: ${e.message}`);
      }

      // Rate limit 방지
      await new Promise((r) => setTimeout(r, 2000));
    }

    this.logger.log("=== 일일 브리핑 생성 완료 ===");
  }
}
