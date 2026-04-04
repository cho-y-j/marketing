import { Controller, Get, Post, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AnalysisService } from "./analysis.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("매장 분석")
@Controller("stores/:storeId/analysis")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalysisController {
  constructor(private analysisService: AnalysisService) {}

  @Get()
  @ApiOperation({ summary: "최신 분석 결과" })
  getLatest(@Param("storeId") storeId: string) {
    return this.analysisService.getLatestAnalysis(storeId);
  }

  @Get("history")
  @ApiOperation({ summary: "분석 히스토리" })
  getHistory(@Param("storeId") storeId: string) {
    return this.analysisService.getAnalysisHistory(storeId);
  }

  @Get("score")
  @ApiOperation({ summary: "경쟁력 점수" })
  getScore(@Param("storeId") storeId: string) {
    return this.analysisService.getCompetitiveScore(storeId);
  }

  @Post("run")
  @ApiOperation({ summary: "AI 분석 실행" })
  runAnalysis(@Param("storeId") storeId: string) {
    return this.analysisService.analyzeStore(storeId);
  }
}
