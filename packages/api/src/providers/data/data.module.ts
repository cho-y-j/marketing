import { Global, Module } from "@nestjs/common";
import { DataCollectorService } from "./data-collector.service";
import { CompetitorFinderService } from "./competitor-finder.service";
import { StoreSetupService } from "./store-setup.service";

@Global()
@Module({
  providers: [DataCollectorService, CompetitorFinderService, StoreSetupService],
  exports: [DataCollectorService, CompetitorFinderService, StoreSetupService],
})
export class DataModule {}
