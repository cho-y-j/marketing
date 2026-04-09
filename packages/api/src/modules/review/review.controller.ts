import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ReviewService } from "./review.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("리뷰")
@Controller("stores/:storeId/reviews")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  @Get()
  @ApiOperation({ summary: "전체 리뷰 목록 (최근 100건)" })
  list(@Param("storeId") storeId: string) {
    return this.reviewService.getAllReviews(storeId);
  }

  @Get("pending")
  @ApiOperation({ summary: "답글 검수 대기 목록 (DRAFTED)" })
  pending(@Param("storeId") storeId: string) {
    return this.reviewService.getPendingReviews(storeId);
  }

  @Post("fetch")
  @ApiOperation({ summary: "네이버 플레이스에서 최근 리뷰 수집 (Playwright)" })
  fetch(@Param("storeId") storeId: string) {
    return this.reviewService.fetchReviews(storeId);
  }

  @Post("draft")
  @ApiOperation({ summary: "PENDING 리뷰에 AI 답글 초안 생성" })
  draft(@Param("storeId") storeId: string) {
    return this.reviewService.draftReplies(storeId);
  }

  @Post(":reviewId/approve")
  @ApiOperation({ summary: "답글 승인 (게시는 별도)" })
  approve(
    @Param("storeId") storeId: string,
    @Param("reviewId") reviewId: string,
    @Body() body: { finalReply?: string },
  ) {
    return this.reviewService.approveReply(
      storeId,
      reviewId,
      body?.finalReply,
    );
  }

  @Post(":reviewId/reject")
  @ApiOperation({ summary: "답글 거절" })
  reject(
    @Param("storeId") storeId: string,
    @Param("reviewId") reviewId: string,
  ) {
    return this.reviewService.rejectReply(storeId, reviewId);
  }
}
