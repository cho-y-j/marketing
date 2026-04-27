import { Global, Module } from "@nestjs/common";
import { AIModule } from "../../providers/ai/ai.module";
import { SalesService } from "./sales.service";
import { SalesController } from "./sales.controller";

@Global()
@Module({
  imports: [AIModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
