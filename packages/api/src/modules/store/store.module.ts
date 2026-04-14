import { Module } from "@nestjs/common";
import { StoreController } from "./store.controller";
import { StoreService } from "./store.service";
import { DashboardService } from "./dashboard.service";
import { MarketingEngineService } from "./marketing-engine.service";

@Module({
  controllers: [StoreController],
  providers: [StoreService, DashboardService, MarketingEngineService],
  exports: [StoreService, DashboardService, MarketingEngineService],
})
export class StoreModule {}
