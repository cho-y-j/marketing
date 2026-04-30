import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { KeywordService } from "./keyword.service";
import { RankCheckService } from "./rank-check.service";
import { KeywordDiscoveryService } from "./keyword-discovery.service";
import { TrafficShiftService } from "./traffic-shift.service";
import { BlogAnalysisService } from "./blog-analysis.service";
import { BrandVolumeService } from "./brand-volume.service";
import { CreateKeywordDto } from "./dto/keyword.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("키워드")
@Controller("stores/:storeId/keywords")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KeywordController {
  constructor(
    private keywordService: KeywordService,
    private rankCheckService: RankCheckService,
    private discoveryService: KeywordDiscoveryService,
    private trafficShift: TrafficShiftService,
    private blogAnalysis: BlogAnalysisService,
    private brandVolume: BrandVolumeService,
  ) {}

  @Get("brand-volume")
  @ApiOperation({ summary: "브랜드 검색량 합산 (매장명 변형 전부)" })
  getBrandVolume(@Param("storeId") storeId: string) {
    return this.brandVolume.getBrandVolume(storeId);
  }

  @Get()
  @ApiOperation({ summary: "키워드 목록" })
  findAll(@Param("storeId") storeId: string) {
    return this.keywordService.findAll(storeId);
  }

  @Get("with-competition")
  @ApiOperation({ summary: "키워드 + 각 Top 3 매장 + 내 위치 (카드용)" })
  @ApiQuery({ name: "compareDate", required: false, type: String, description: "YYYY-MM-DD — 그 날짜와 변동 비교" })
  findAllWithCompetition(
    @Param("storeId") storeId: string,
    @Query("compareDate") compareDate?: string,
  ) {
    return this.keywordService.findAllWithCompetition(storeId, compareDate);
  }

  @Get("recommended")
  @ApiOperation({ summary: "AI 추천 키워드" })
  getRecommended(@Param("storeId") storeId: string) {
    return this.keywordService.getRecommended(storeId);
  }

  @Get("trends")
  @ApiOperation({ summary: "키워드 트렌드" })
  getTrends(@Param("storeId") storeId: string) {
    return this.keywordService.getTrends(storeId);
  }

  @Post()
  @ApiOperation({ summary: "키워드 추가" })
  create(
    @Param("storeId") storeId: string,
    @Body() dto: CreateKeywordDto,
  ) {
    return this.keywordService.create(storeId, dto);
  }

  @Post("rank-check")
  @ApiOperation({ summary: "전체 키워드 순위 체크" })
  checkAllRanks(@Param("storeId") storeId: string) {
    return this.rankCheckService.checkAllKeywordRanks(storeId);
  }

  @Get("rank-check/:keyword")
  @ApiOperation({ summary: "단일 키워드 순위 체크" })
  checkSingleRank(
    @Param("storeId") storeId: string,
    @Param("keyword") keyword: string,
  ) {
    return this.rankCheckService.checkSingleKeyword(storeId, keyword);
  }

  @Get("rank-history")
  @ApiOperation({ summary: "순위 히스토리 (차트용)" })
  getRankHistory(
    @Param("storeId") storeId: string,
    @Query("days") days?: string,
    @Query("keyword") keyword?: string,
  ) {
    return this.rankCheckService.getRankHistory(
      storeId,
      days ? parseInt(days) : 7,
      keyword,
    );
  }

  @Get("rank-history/summary")
  @ApiOperation({ summary: "순위 히스토리 요약" })
  getRankHistorySummary(@Param("storeId") storeId: string) {
    return this.rankCheckService.getRankHistorySummary(storeId);
  }

  @Post("discover")
  @ApiOperation({ summary: "AI 키워드 발굴" })
  discoverKeywords(@Param("storeId") storeId: string) {
    return this.discoveryService.discoverKeywords(storeId);
  }

  @Post("cleanup")
  @ApiOperation({ summary: "키워드 정리 — 월300미만(회식예외) + 지역성결여 일괄 제거" })
  cleanup(@Param("storeId") storeId: string) {
    return this.keywordService.cleanupByRules(storeId);
  }

  @Post("refresh-volume")
  @ApiOperation({ summary: "전체 키워드 검색량 새로고침" })
  refreshVolumes(@Param("storeId") storeId: string) {
    return this.keywordService.refreshAllSearchVolumes(storeId);
  }

  @Post("traffic-shift/record")
  @ApiOperation({
    summary: "검색량 히스토리 기록 (트래픽 이동 분석용)",
  })
  recordVolumes(@Param("storeId") storeId: string) {
    return this.trafficShift.recordCurrentVolumes(storeId);
  }

  @Get("traffic-shift")
  @ApiOperation({
    summary: "검색 트래픽 이동 분석 (감소 키워드 → 후보 키워드 + AI 해석)",
  })
  @ApiQuery({ name: "threshold", required: false, type: Number })
  analyzeTrafficShift(
    @Param("storeId") storeId: string,
    @Query("threshold") threshold?: string,
  ) {
    return this.trafficShift.analyzeShifts(
      storeId,
      threshold ? parseFloat(threshold) : -15,
    );
  }

  @Post("blog-analysis")
  @ApiOperation({ summary: "블로그 상위노출 분석 실행 (전체 키워드)" })
  runBlogAnalysis(@Param("storeId") storeId: string) {
    // 비동기 실행 — 바로 응답
    this.blogAnalysis.analyzeAllKeywords(storeId).catch(() => {});
    return { message: "블로그 분석이 시작되었습니다", storeId };
  }

  @Get("blog-analysis")
  @ApiOperation({ summary: "블로그 상위노출 분석 결과 조회" })
  getBlogAnalysis(@Param("storeId") storeId: string) {
    return this.blogAnalysis.getSummary(storeId);
  }

  @Get("preview-volume")
  @ApiOperation({ summary: "키워드 검색량 미리보기 (추가 전 조회)" })
  async previewKeywordVolume(@Query("keyword") keyword: string) {
    if (!keyword) return { keyword: "", monthly: 0, weekly: 0, daily: 0, available: false };
    return this.keywordService.previewVolume(keyword);
  }

  @Delete(":keywordId")
  @ApiOperation({ summary: "키워드 제외 (삭제 + 재생성 방지)" })
  excludeKeyword(
    @Param("storeId") storeId: string,
    @Param("keywordId") keywordId: string,
    @Body() body: { reason?: string },
  ) {
    return this.keywordService.excludeKeyword(storeId, keywordId, body?.reason);
  }

  @Get("excluded")
  @ApiOperation({ summary: "제외된 키워드 목록" })
  listExcluded(@Param("storeId") storeId: string) {
    return this.keywordService.listExcluded(storeId);
  }

  @Delete("excluded/:excludedId")
  @ApiOperation({ summary: "제외 해제 (재생성 시 다시 포함)" })
  unexclude(
    @Param("storeId") storeId: string,
    @Param("excludedId") excludedId: string,
  ) {
    return this.keywordService.removeExclusion(storeId, excludedId);
  }

  @Get("competition/:keyword")
  @ApiOperation({ summary: "키워드별 경쟁 매트릭스 (Top 10 매장 + 내 위치 + N일전 비교)" })
  getKeywordCompetition(
    @Param("storeId") storeId: string,
    @Param("keyword") keyword: string,
    @Query("compareDays") compareDays?: string,
  ) {
    return this.rankCheckService.getKeywordCompetition(
      storeId,
      decodeURIComponent(keyword),
      compareDays ? parseInt(compareDays) : 1,
    );
  }
}
