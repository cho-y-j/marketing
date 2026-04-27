import { Global, Module } from "@nestjs/common";
import { BlogMentionService } from "./blog-mention.service";
import { BlogMentionController } from "./blog-mention.controller";

@Global()
@Module({
  controllers: [BlogMentionController],
  providers: [BlogMentionService],
  exports: [BlogMentionService],
})
export class BlogMentionModule {}
