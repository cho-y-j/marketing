import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../common/prisma.service";
import { DataCollectorService } from "../providers/data/data-collector.service";
import { AnalysisService } from "../modules/analysis/analysis.service";
import { RankCheckService } from "../modules/keyword/rank-check.service";

@Injectable()
export class BatchAnalysisJob {
  private readonly logger = new Logger(BatchAnalysisJob.name);

  constructor(
    private prisma: PrismaService,
    private dataCollector: DataCollectorService,
    private analysisService: AnalysisService,
    private rankCheckService: RankCheckService,
  ) {}

  // 매일 새벽 4시 — 데이터 수집 + AI 분석
  @Cron("0 4 * * *")
  async runDailyAnalysis() {
    this.logger.log("=== 일일 배치 분석 시작 ===");
    const stores = await this.getActiveStores();
    for (const store of stores) {
      try {
        await this.dataCollector.collectDailyUpdate(store.id);
        await this.analysisService.analyzeStore(store.id);
        this.logger.log(`분석 완료: ${store.name}`);
      } catch (e: any) {
        this.logger.error(`분석 실패 [${store.name}]: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    this.logger.log("=== 일일 배치 분석 완료 ===");
  }

  // 매일 새벽 5시 — 순위 체크
  @Cron("0 5 * * *")
  async runDailyRankCheck() {
    this.logger.log("=== 일일 순위 체크 시작 ===");
    const stores = await this.getActiveStores();
    for (const store of stores) {
      try {
        await this.rankCheckService.checkAllKeywordRanks(store.id);
        this.logger.log(`순위 체크 완료: ${store.name}`);
      } catch (e: any) {
        this.logger.error(`순위 체크 실패 [${store.name}]: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    this.logger.log("=== 일일 순위 체크 완료 ===");
  }

  private async getActiveStores() {
    return this.prisma.store.findMany({
      where: { user: { subscriptionPlan: { not: "FREE" } } },
    });
  }
}
