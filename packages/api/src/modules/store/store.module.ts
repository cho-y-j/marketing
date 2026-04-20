import { Module } from "@nestjs/common";
import { StoreController } from "./store.controller";
import { StoreService } from "./store.service";
import { DashboardService } from "./dashboard.service";
import { MarketingEngineService } from "./marketing-engine.service";
import { DailySnapshotService } from "./daily-snapshot.service";
import { DailySnapshotJob } from "../../jobs/daily-snapshot.job";
import { AIModule } from "../../providers/ai/ai.module";

@Module({
  imports: [AIModule],
  controllers: [StoreController],
  providers: [StoreService, DashboardService, MarketingEngineService, DailySnapshotService, DailySnapshotJob],
  exports: [StoreService, DashboardService, MarketingEngineService, DailySnapshotService, DailySnapshotJob],
})
export class StoreModule {}
