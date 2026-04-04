import { Global, Module } from "@nestjs/common";
import { AIProvider } from "./ai.provider";

@Global()
@Module({
  providers: [AIProvider],
  exports: [AIProvider],
})
export class AIModule {}
