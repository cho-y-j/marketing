import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AdminGuard, Roles } from "../../common/guards/admin.guard";
import { PrismaService } from "../../common/prisma.service";
import { UserRole } from "@prisma/client";

@Controller("admin/consultations")
@UseGuards(AuthGuard("jwt"), AdminGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminConsultationController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll(@Query("status") status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.consultationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    return this.prisma.consultationRequest.update({
      where: { id },
      data: {
        status: body.status,
        contactedAt: body.status === "CONTACTED" ? new Date() : undefined,
      },
    });
  }
}
