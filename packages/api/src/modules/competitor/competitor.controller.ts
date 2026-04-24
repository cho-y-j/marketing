import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CompetitorService } from "./competitor.service";
import { CompetitorBackfillService } from "./competitor-backfill.service";
import { CreateCompetitorDto } from "./dto/competitor.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../../common/prisma.service";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { StoreSetupService } from "../../providers/data/store-setup.service";

@ApiTags("경쟁 매장")
@Controller("stores/:storeId/competitors")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CompetitorController {
  constructor(
    private competitorService: CompetitorService,
    private backfillService: CompetitorBackfillService,
    private prisma: PrismaService,
    private naverPlace: NaverPlaceProvider,
    private storeSetup: StoreSetupService,
  ) {}

  @Get("search")
  @ApiOperation({ summary: "경쟁업체 검색 (존재여부 검증)" })
  async searchCompetitor(@Query("name") name: string) {
    if (!name) return [];
    const info = await this.naverPlace.searchAndGetPlaceInfo(name);
    if (!info) return [];
    return {
      name: info.name,
      placeId: info.id,
      category: info.category,
      address: info.roadAddress || info.address,
      visitorReviewCount: info.visitorReviewCount,
      blogReviewCount: info.blogReviewCount,
      saveCount: info.saveCount,
    };
  }

  @Get()
  @ApiOperation({ summary: "경쟁 매장 목록 (competitionType: EXPOSURE|DIRECT 로 필터)" })
  findAll(
    @Param("storeId") storeId: string,
    @Query("competitionType") competitionType?: "EXPOSURE" | "DIRECT",
  ) {
    return this.competitorService.findAll(storeId, competitionType);
  }

  @Post()
  @ApiOperation({ summary: "경쟁 매장 추가" })
  create(
    @Param("storeId") storeId: string,
    @Body() dto: CreateCompetitorDto,
  ) {
    return this.competitorService.create(storeId, dto);
  }

  @Delete(":competitorId")
  @ApiOperation({ summary: "경쟁 매장 삭제" })
  remove(
    @Param("storeId") storeId: string,
    @Param("competitorId") competitorId: string,
  ) {
    return this.competitorService.remove(storeId, competitorId);
  }

  @Get("compare")
  @ApiOperation({ summary: "경쟁 비교 분석 (competitionType: EXPOSURE|DIRECT 로 필터)" })
  compare(
    @Param("storeId") storeId: string,
    @Query("competitionType") competitionType?: "EXPOSURE" | "DIRECT",
  ) {
    return this.competitorService.getComparison(storeId, competitionType);
  }

  @Post("refresh")
  @ApiOperation({ summary: "경쟁 매장 데이터 새로고침" })
  refresh(@Param("storeId") storeId: string) {
    return this.competitorService.refreshAll(storeId);
  }

  @Post("rediscover")
  @ApiOperation({ summary: "경쟁사 재탐색 — 현재 키워드 기준 교집합 스코어로 재선별" })
  rediscover(@Param("storeId") storeId: string) {
    return this.storeSetup.rediscoverCompetitors(storeId);
  }

  @Post("backfill-place-ids")
  @ApiOperation({ summary: "placeId NULL 경쟁사 재검색·보강 (수동 트리거)" })
  backfillPlaceIds(@Param("storeId") storeId: string) {
    return this.competitorService.backfillNullPlaceIds(storeId);
  }

  @Post("backfill-history")
  @ApiOperation({ summary: "경쟁사 과거 30일 일별 스냅샷 역산 (네이버 공개 데이터 기반)" })
  backfillHistory(@Param("storeId") storeId: string) {
    return this.backfillService.backfillAllCompetitors(storeId);
  }

  @Get("alerts")
  @ApiOperation({ summary: "경쟁사 알림 + AI 대응 추천 목록" })
  async getAlerts(@Param("storeId") storeId: string) {
    return this.prisma.competitorAlert.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
}
