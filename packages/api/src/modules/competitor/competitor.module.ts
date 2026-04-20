import { Module } from "@nestjs/common";
import { CompetitorController } from "./competitor.controller";
import { CompetitorService } from "./competitor.service";
import { CompetitorPlaceIdBackfillJob } from "../../jobs/competitor-placeid-backfill.job";

@Module({
  controllers: [CompetitorController],
  providers: [CompetitorService, CompetitorPlaceIdBackfillJob],
  exports: [CompetitorService],
})
export class CompetitorModule {}
