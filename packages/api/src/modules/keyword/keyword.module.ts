import { Module } from "@nestjs/common";
import { KeywordController } from "./keyword.controller";
import { KeywordService } from "./keyword.service";
import { RankCheckService } from "./rank-check.service";
import { KeywordDiscoveryService } from "./keyword-discovery.service";

@Module({
  controllers: [KeywordController],
  providers: [KeywordService, RankCheckService, KeywordDiscoveryService],
  exports: [KeywordService, RankCheckService, KeywordDiscoveryService],
})
export class KeywordModule {}
