import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { StoreService } from "./store.service";
import { CreateStoreDto, UpdateStoreDto } from "./dto/store.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StoreSetupService } from "../../providers/data/store-setup.service";
import { EventCollectorService } from "../../providers/data/event-collector.service";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { DashboardService } from "./dashboard.service";
import { DailySnapshotService } from "./daily-snapshot.service";
import { DailySnapshotJob } from "../../jobs/daily-snapshot.job";
import { PrismaService } from "../../common/prisma.service";

@ApiTags("매장")
@Controller("stores")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StoreController {
  constructor(
    private storeService: StoreService,
    private storeSetup: StoreSetupService,
    private eventCollector: EventCollectorService,
    private naverPlace: NaverPlaceProvider,
    private dashboard: DashboardService,
    private dailySnapshot: DailySnapshotService,
    private dailySnapshotJob: DailySnapshotJob,
    private prisma: PrismaService,
  ) {}

  @Get("dashboard/:storeId")
  @ApiOperation({ summary: "대시보드 종합 데이터 (한 번의 호출로)" })
  getDashboard(@Param("storeId") storeId: string) {
    return this.dashboard.getDashboardData(storeId);
  }

  // Phase 8 — 매장 일별 흐름 (현재/어제/delta/7일평균/10일 시계열)
  @Get(":storeId/flow")
  @ApiOperation({ summary: "매장 일별 흐름 — 리뷰 증가량 + 7일 평균 + 10일 추이" })
  getStoreFlow(@Param("storeId") storeId: string) {
    return this.dailySnapshot.getStoreFlow(storeId);
  }

  // Phase 8 — 매장 추적 키워드 전체 오늘/어제 검색량 (대시보드용)
  @Get(":storeId/keywords/flow")
  @ApiOperation({ summary: "키워드별 오늘/어제 검색량 맵" })
  getKeywordsFlow(@Param("storeId") storeId: string) {
    return this.dailySnapshot.getKeywordsFlowForStore(storeId);
  }

  // Phase 8 — 경쟁사 일평균 발행량 (속도 기반 비교용)
  @Get(":storeId/competitors/daily")
  @ApiOperation({ summary: "경쟁사 일평균 발행량 — 상위 1~10등 vs 내 매장" })
  getCompetitorDaily(@Param("storeId") storeId: string) {
    return this.dailySnapshot.getCompetitorDailyAverages(storeId, 10);
  }

  @Get(":storeId/competitors/timeline")
  @ApiOperation({ summary: "경쟁사 30일 타임라인 — 날짜별 발행량 조회용" })
  getCompetitorTimeline(@Param("storeId") storeId: string) {
    return this.dailySnapshot.getCompetitorTimeline(storeId, 10);
  }

  // Phase 8 — 일별 스냅샷 즉시 수집 (테스트/백필용)
  @Post(":storeId/snapshot/run")
  @ApiOperation({ summary: "일별 스냅샷 즉시 수집 (cron 대기 없이 트리거)" })
  async runSnapshot() {
    await this.dailySnapshotJob.runDaily();
    return { ok: true };
  }

  @Get("place-preview")
  @ApiOperation({ summary: "플레이스 URL/매장명으로 매장 정보 미리보기" })
  async placePreview(
    @Query("url") url?: string,
    @Query("name") name?: string,
  ) {
    // 1. URL에서 placeId 추출 → 직접 조회
    if (url) {
      const placeId = this.naverPlace.extractPlaceIdFromUrl(url);
      if (placeId) {
        try {
          const info = await this.naverPlace.getPlaceDetail(placeId);
          if (info) return { ...info, placeId };
        } catch {}

        // placeId는 있지만 상세 조회 실패 → 최소 정보라도 반환
        return {
          id: placeId,
          placeId,
          name: "매장 정보 조회 중",
          category: "",
          address: "",
          roadAddress: "",
          phone: "",
          businessHours: "",
          _fallback: true,
          _message: "네이버 API에서 상세 정보를 가져오지 못했습니다. 등록 후 자동 수집됩니다.",
        };
      }
    }
    // 2. 매장명으로 검색
    if (name) {
      try {
        const info = await this.naverPlace.searchAndGetPlaceInfo(name);
        if (info) return info;
      } catch {}
    }
    return null;
  }

  @Post()
  @ApiOperation({ summary: "매장 등록" })
  create(@Req() req: any, @Body() dto: CreateStoreDto) {
    return this.storeService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "내 매장 목록" })
  findAll(@Req() req: any) {
    return this.storeService.findAllByUser(req.user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "매장 상세" })
  findOne(@Param("id") id: string, @Req() req: any) {
    return this.storeService.findOne(id, req.user.id);
  }

  @Put(":id")
  @ApiOperation({ summary: "매장 수정" })
  update(
    @Param("id") id: string,
    @Req() req: any,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storeService.update(id, req.user.id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "매장 삭제" })
  remove(@Param("id") id: string, @Req() req: any) {
    return this.storeService.remove(id, req.user.id);
  }

  @Post(":id/setup")
  @ApiOperation({ summary: "매장 자동 셋업 재시도 (AI 키워드 + 경쟁매장 + 검색량)" })
  async setup(@Param("id") id: string) {
    // 비동기 실행 — 바로 응답 후 백그라운드 진행
    this.storeSetup.autoSetup(id).catch(() => {});
    return { message: "셋업이 시작되었습니다", storeId: id };
  }

  @Get(":id/setup-status")
  @ApiOperation({ summary: "매장 셋업 진행 상태 조회" })
  getSetupStatus(@Param("id") id: string) {
    return this.storeSetup.getSetupStatus(id);
  }

  @Post(":id/events/collect")
  @ApiOperation({ summary: "주변 축제/이벤트 수집 (TourAPI)" })
  collectEvents(@Param("id") id: string) {
    return this.eventCollector.collectForStore(id);
  }

  @Get(":id/events")
  @ApiOperation({ summary: "현재 진행 중인 주변 축제/이벤트 조회" })
  getEvents(@Param("id") id: string) {
    return this.eventCollector.getActiveEventsForStore(id);
  }

  @Post("consultation")
  @ApiOperation({ summary: "전문 상담 신청" })
  createConsultation(
    @Body() body: {
      name: string;
      phone: string;
      type: string;
      message?: string;
      storeId?: string;
    },
    @Req() req: any,
  ) {
    return this.prisma.consultationRequest.create({
      data: {
        name: body.name,
        phone: body.phone,
        type: body.type,
        message: body.message,
        storeId: body.storeId,
        userId: req.user?.id,
      },
    });
  }
}
