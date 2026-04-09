import { Controller, Get, Post, Put, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ActionService } from "./action.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("AI 자동 실행")
@Controller("stores/:storeId/actions")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ActionController {
  constructor(private actionService: ActionService) {}

  @Get("pending")
  @ApiOperation({ summary: "승인 대기 중인 AI 액션 목록" })
  getPending(@Param("storeId") storeId: string) {
    return this.actionService.getPendingActions(storeId);
  }

  @Get("history")
  @ApiOperation({ summary: "AI 액션 실행 히스토리" })
  getHistory(@Param("storeId") storeId: string) {
    return this.actionService.getActionHistory(storeId);
  }

  @Post(":actionId/approve")
  @ApiOperation({ summary: "AI 액션 승인 → 즉시 실행" })
  approve(
    @Param("storeId") storeId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actionService.approveAction(storeId, actionId);
  }

  @Post(":actionId/reject")
  @ApiOperation({ summary: "AI 액션 거절" })
  reject(
    @Param("storeId") storeId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actionService.rejectAction(storeId, actionId);
  }

  @Get("settings")
  @ApiOperation({ summary: "자동화 설정 조회" })
  getSettings(@Param("storeId") storeId: string) {
    return this.actionService.getOrCreateSettings(storeId);
  }

  @Put("settings")
  @ApiOperation({ summary: "자동화 설정 변경" })
  updateSettings(
    @Param("storeId") storeId: string,
    @Body() body: {
      autoReviewReply?: boolean;
      autoContentPublish?: boolean;
      contentPublishPerWeek?: number;
      autoSeasonalKeyword?: boolean;
      autoHiddenKeyword?: boolean;
    },
  ) {
    return this.actionService.updateSettings(storeId, body);
  }
}
