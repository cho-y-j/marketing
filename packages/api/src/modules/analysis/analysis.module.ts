import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { PlaceIndexService } from "./place-index.service";
import { ActionTrackingService } from "./action-tracking.service";
import { GradeService } from "./grade.service";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, PlaceIndexService, ActionTrackingService, GradeService],
  exports: [AnalysisService, PlaceIndexService, ActionTrackingService, GradeService],
})
export class AnalysisModule {}
