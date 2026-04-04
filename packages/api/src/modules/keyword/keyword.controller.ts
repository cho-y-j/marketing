import { Controller, Get, Post, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { KeywordService } from "./keyword.service";
import { RankCheckService } from "./rank-check.service";
import { KeywordDiscoveryService } from "./keyword-discovery.service";
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
  ) {}

  @Get()
  @ApiOperation({ summary: "키워드 목록" })
  findAll(@Param("storeId") storeId: string) {
    return this.keywordService.findAll(storeId);
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

  @Post("refresh-volume")
  @ApiOperation({ summary: "전체 키워드 검색량 새로고침" })
  refreshVolumes(@Param("storeId") storeId: string) {
    return this.keywordService.refreshAllSearchVolumes(storeId);
  }
}
