import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { NotificationService } from "./notification.service";
import { PushService } from "./push.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("알림")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private pushService: PushService,
  ) {}

  @Get()
  @ApiOperation({ summary: "알림 목록" })
  getAll(@Req() req: any) {
    return this.notificationService.getAll(req.user.id);
  }

  @Get("unread")
  @ApiOperation({ summary: "읽지 않은 알림" })
  getUnread(@Req() req: any) {
    return this.notificationService.getUnread(req.user.id);
  }

  @Post(":id/read")
  @ApiOperation({ summary: "알림 읽음 처리" })
  markAsRead(@Param("id") id: string) {
    return this.notificationService.markAsRead(id);
  }

  @Post("read-all")
  @ApiOperation({ summary: "전체 읽음 처리" })
  markAllAsRead(@Req() req: any) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  // ===== 푸시 구독 =====

  @Get("push/vapid-key")
  @ApiOperation({ summary: "Web Push VAPID 공개키 (구독 시 필요)" })
  getVapidKey() {
    const key = this.pushService.getVapidPublicKey();
    return {
      publicKey: key,
      configured: !!key,
    };
  }

  @Post("push/subscribe")
  @ApiOperation({ summary: "푸시 구독 등록 (Web Push 또는 FCM)" })
  subscribe(@Req() req: any, @Body() body: any) {
    return this.pushService.subscribe(req.user.id, body);
  }

  @Delete("push/subscribe")
  @ApiOperation({ summary: "푸시 구독 해제" })
  unsubscribe(@Req() req: any, @Body() body: { endpoint: string }) {
    return this.pushService.unsubscribe(req.user.id, body.endpoint);
  }

  @Post("push/test")
  @ApiOperation({ summary: "내 모든 구독에 테스트 알림 발송" })
  testPush(@Req() req: any) {
    return this.pushService.sendToUser(req.user.id, {
      title: "테스트 알림",
      body: "푸시 구독이 정상 동작합니다.",
      data: { test: true },
      url: "/dashboard",
    });
  }
}
