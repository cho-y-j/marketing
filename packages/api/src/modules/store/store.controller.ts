import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { StoreService } from "./store.service";
import { CreateStoreDto, UpdateStoreDto } from "./dto/store.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StoreSetupService } from "../../providers/data/store-setup.service";
import { EventCollectorService } from "../../providers/data/event-collector.service";

@ApiTags("매장")
@Controller("stores")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StoreController {
  constructor(
    private storeService: StoreService,
    private storeSetup: StoreSetupService,
    private eventCollector: EventCollectorService,
  ) {}

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
}
