import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CompetitorService } from "./competitor.service";
import { CreateCompetitorDto } from "./dto/competitor.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("경쟁 매장")
@Controller("stores/:storeId/competitors")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CompetitorController {
  constructor(private competitorService: CompetitorService) {}

  @Get()
  @ApiOperation({ summary: "경쟁 매장 목록" })
  findAll(@Param("storeId") storeId: string) {
    return this.competitorService.findAll(storeId);
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
  @ApiOperation({ summary: "경쟁 비교 분석" })
  compare(@Param("storeId") storeId: string) {
    return this.competitorService.getComparison(storeId);
  }

  @Post("refresh")
  @ApiOperation({ summary: "경쟁 매장 데이터 새로고침" })
  refresh(@Param("storeId") storeId: string) {
    return this.competitorService.refreshAll(storeId);
  }
}
