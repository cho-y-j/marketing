import { Module, forwardRef } from "@nestjs/common";
import { ActionController } from "./action.controller";
import { ActionService } from "./action.service";
import { ContentModule } from "../content/content.module";
import { ReviewModule } from "../review/review.module";
import { AnalysisModule } from "../analysis/analysis.module";

@Module({
  imports: [
    forwardRef(() => ContentModule),
    forwardRef(() => ReviewModule),
    forwardRef(() => AnalysisModule),
  ],
  controllers: [ActionController],
  providers: [ActionService],
  exports: [ActionService],
})
export class ActionModule {}
