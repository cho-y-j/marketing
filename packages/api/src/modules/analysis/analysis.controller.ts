import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AnalysisService } from "./analysis.service";
import { ActionTrackingService } from "./action-tracking.service";
import { GradeService } from "./grade.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("매장 분석")
@Controller("stores/:storeId/analysis")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalysisController {
  constructor(
    private analysisService: AnalysisService,
    private actionTracking: ActionTrackingService,
    private gradeService: GradeService,
  ) {}

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

  // 액션 추적
  @Post("actions")
  @ApiOperation({ summary: "마케팅 액션 기록" })
  logAction(
    @Param("storeId") storeId: string,
    @Body() body: { actionType: string; description: string; relatedKeywords?: string[] },
  ) {
    return this.actionTracking.logAction(storeId, body);
  }

  @Get("actions")
  @ApiOperation({ summary: "액션 히스토리" })
  getActions(@Param("storeId") storeId: string) {
    return this.actionTracking.getActionHistory(storeId);
  }

  @Get("actions/weekly")
  @ApiOperation({ summary: "주간 액션 성과 요약" })
  getWeeklyActions(@Param("storeId") storeId: string) {
    return this.actionTracking.getWeeklySummary(storeId);
  }

  @Get("roi")
  @ApiOperation({ summary: "ROI 대시보드" })
  getROI(@Param("storeId") storeId: string) {
    return this.actionTracking.calculateROI(storeId);
  }

  @Post("actions/measure")
  @ApiOperation({ summary: "미측정 액션 효과 일괄 측정" })
  measureEffects(@Param("storeId") storeId: string) {
    return this.actionTracking.measurePendingEffects(storeId);
  }

  @Get("grade")
  @ApiOperation({ summary: "마케팅 등급 조회 + 재계산" })
  getGrade(@Param("storeId") storeId: string) {
    return this.gradeService.recalculateGrade(storeId);
  }

  @Get("benchmark")
  @ApiOperation({ summary: "동네 벤치마크 (같은 업종 내 순위)" })
  getBenchmark(@Param("storeId") storeId: string) {
    return this.gradeService.getBenchmark(storeId);
  }
}
