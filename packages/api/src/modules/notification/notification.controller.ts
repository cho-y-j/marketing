import { Controller, Get, Post, Param, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { NotificationService } from "./notification.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("알림")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

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
}
