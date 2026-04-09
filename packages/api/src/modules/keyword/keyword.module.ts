import { Module } from "@nestjs/common";
import { KeywordController } from "./keyword.controller";
import { KeywordService } from "./keyword.service";
import { RankCheckService } from "./rank-check.service";
import { KeywordDiscoveryService } from "./keyword-discovery.service";
import { TrafficShiftService } from "./traffic-shift.service";

@Module({
  controllers: [KeywordController],
  providers: [
    KeywordService,
    RankCheckService,
    KeywordDiscoveryService,
    TrafficShiftService,
  ],
  exports: [
    KeywordService,
    RankCheckService,
    KeywordDiscoveryService,
    TrafficShiftService,
  ],
})
export class KeywordModule {}
