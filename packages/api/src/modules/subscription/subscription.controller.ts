import { Controller, Get, Post, Body, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SubscriptionService } from "./subscription.service";
import { UpgradeDto, RegisterApiKeyDto } from "./dto/subscription.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("구독")
@Controller("subscription")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  @Get()
  @ApiOperation({ summary: "내 구독 정보" })
  getSubscription(@Req() req: any) {
    return this.subscriptionService.getSubscription(req.user.id);
  }

  @Post("upgrade")
  @ApiOperation({ summary: "구독 업그레이드" })
  upgrade(@Req() req: any, @Body() dto: UpgradeDto) {
    return this.subscriptionService.upgrade(req.user.id, dto);
  }

  @Post("api-key")
  @ApiOperation({ summary: "API 키 등록 (프리미엄)" })
  registerApiKey(@Req() req: any, @Body() dto: RegisterApiKeyDto) {
    return this.subscriptionService.registerApiKey(req.user.id, dto);
  }
}
