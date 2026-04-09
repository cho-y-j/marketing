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

@Global()
@Module({
  imports: [
    forwardRef(() => KeywordModule),
    forwardRef(() => AnalysisModule),
    forwardRef(() => BriefingModule),
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
