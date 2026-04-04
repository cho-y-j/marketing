import { Controller, Get, Post, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { BriefingService } from "./briefing.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("브리핑")
@Controller("stores/:storeId/briefing")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BriefingController {
  constructor(private briefingService: BriefingService) {}

  @Get("today")
  @ApiOperation({ summary: "오늘 브리핑" })
  getToday(@Param("storeId") storeId: string) {
    return this.briefingService.getTodayBriefing(storeId);
  }

  @Get("history")
  @ApiOperation({ summary: "브리핑 히스토리" })
  getHistory(@Param("storeId") storeId: string) {
    return this.briefingService.getBriefingHistory(storeId);
  }

  @Post("generate")
  @ApiOperation({ summary: "오늘 브리핑 생성" })
  generate(@Param("storeId") storeId: string) {
    return this.briefingService.generateDailyBriefing(storeId);
  }
}
