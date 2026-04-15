import { Module } from "@nestjs/common";
import { KeywordController } from "./keyword.controller";
import { KeywordService } from "./keyword.service";
import { RankCheckService } from "./rank-check.service";
import { KeywordDiscoveryService } from "./keyword-discovery.service";
import { TrafficShiftService } from "./traffic-shift.service";
import { BlogAnalysisService } from "./blog-analysis.service";
import { BrandVolumeService } from "./brand-volume.service";

@Module({
  controllers: [KeywordController],
  providers: [
    KeywordService,
    RankCheckService,
    KeywordDiscoveryService,
    TrafficShiftService,
    BlogAnalysisService,
    BrandVolumeService,
  ],
  exports: [
    KeywordService,
    RankCheckService,
    KeywordDiscoveryService,
    TrafficShiftService,
    BlogAnalysisService,
    BrandVolumeService,
  ],
})
export class KeywordModule {}
