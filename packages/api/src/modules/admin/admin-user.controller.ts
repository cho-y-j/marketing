import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AdminGuard, Roles } from "../../common/guards/admin.guard";
import { AdminUserService } from "./admin-user.service";
import { UserRole, SubscriptionPlan } from "@prisma/client";

@Controller("admin/users")
@UseGuards(AuthGuard("jwt"), AdminGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("role") role?: string,
    @Query("status") status?: string,
  ) {
    return this.adminUserService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      role,
      status,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.adminUserService.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: {
      name?: string;
      phone?: string;
      companyName?: string;
      businessNumber?: string;
      role?: UserRole;
      subscriptionPlan?: SubscriptionPlan;
    },
  ) {
    return this.adminUserService.update(id, body);
  }

  @Patch(":id/suspend")
  suspend(
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminUserService.suspend(id, body.reason);
  }

  @Patch(":id/activate")
  activate(@Param("id") id: string) {
    return this.adminUserService.activate(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.adminUserService.remove(id);
  }
}
