import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BlogMentionService } from "./blog-mention.service";

@ApiTags("블로그 멘션")
@Controller("stores/:storeId/blog-mentions")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BlogMentionController {
  constructor(private service: BlogMentionService) {}

  @Get()
  @ApiOperation({ summary: "외부 블로그 mention 통합 (30일 카운트 + 추세 + 최근 글 + 경쟁사 비교)" })
  getOverview(@Param("storeId") storeId: string) {
    return this.service.getOverview(storeId);
  }

  @Post("collect")
  @ApiOperation({ summary: "지금 즉시 새 글 수집 트리거 (수동)" })
  collect(@Param("storeId") storeId: string) {
    return this.service.collectForStore(storeId);
  }
}
