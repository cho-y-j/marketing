import { Module } from "@nestjs/common";
import { BatchAnalysisJob } from "./batch-analysis.job";
import { BriefingGenerationJob } from "./briefing-generation.job";
import { AnalysisModule } from "../modules/analysis/analysis.module";
import { BriefingModule } from "../modules/briefing/briefing.module";
import { KeywordModule } from "../modules/keyword/keyword.module";

@Module({
  imports: [AnalysisModule, BriefingModule, KeywordModule],
  providers: [BatchAnalysisJob, BriefingGenerationJob],
})
export class JobsModule {}
