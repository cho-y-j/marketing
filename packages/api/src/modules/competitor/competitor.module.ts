import { Module } from "@nestjs/common";
import { CompetitorController } from "./competitor.controller";
import { CompetitorService } from "./competitor.service";
import { CompetitorBackfillService } from "./competitor-backfill.service";
import { CompetitorPlaceIdBackfillJob } from "../../jobs/competitor-placeid-backfill.job";

@Module({
  controllers: [CompetitorController],
  providers: [CompetitorService, CompetitorBackfillService, CompetitorPlaceIdBackfillJob],
  exports: [CompetitorService, CompetitorBackfillService],
})
export class CompetitorModule {}
