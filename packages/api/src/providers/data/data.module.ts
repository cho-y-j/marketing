import { Global, Module, forwardRef } from "@nestjs/common";
import { DataCollectorService } from "./data-collector.service";
import { CompetitorFinderService } from "./competitor-finder.service";
import { StoreSetupService } from "./store-setup.service";
import { TourapiProvider } from "./tourapi.provider";
import { EventCollectorService } from "./event-collector.service";
import { KamisProvider } from "./kamis.provider";
import { IngredientCollectorService } from "./ingredient-collector.service";
import { KeywordModule } from "../../modules/keyword/keyword.module";
import { AnalysisModule } from "../../modules/analysis/analysis.module";
import { BriefingModule } from "../../modules/briefing/briefing.module";
import { StoreModule } from "../../modules/store/store.module";
import { CompetitorModule } from "../../modules/competitor/competitor.module";
import { JobsModule } from "../../jobs/jobs.module";

@Global()
@Module({
  imports: [
    forwardRef(() => KeywordModule),
    forwardRef(() => AnalysisModule),
    forwardRef(() => BriefingModule),
    forwardRef(() => StoreModule),
    forwardRef(() => CompetitorModule),
    // 첫 순위 체크를 Bull 큐에 enqueue 하기 위해 BatchAnalysisJob 주입 필요.
    // 순환 의존: JobsModule 도 DataModule 을 import → forwardRef 양쪽 필수.
    forwardRef(() => JobsModule),
  ],
  providers: [
    DataCollectorService,
    CompetitorFinderService,
    StoreSetupService,
    TourapiProvider,
    EventCollectorService,
    KamisProvider,
    IngredientCollectorService,
  ],
  exports: [
    DataCollectorService,
    CompetitorFinderService,
    StoreSetupService,
    TourapiProvider,
    EventCollectorService,
    KamisProvider,
    IngredientCollectorService,
  ],
})
export class DataModule {}
