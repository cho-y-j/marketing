import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AdminGuard, Roles } from "../../common/guards/admin.guard";
import { AdminRuleService } from "./admin-rule.service";
import { UserRole } from "@prisma/client";

@Controller("admin/keyword-rules")
@UseGuards(AuthGuard("jwt"), AdminGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminRuleController {
  constructor(private readonly adminRuleService: AdminRuleService) {}

  @Get()
  findAll(
    @Query("industry") industry?: string,
    @Query("isActive") isActive?: string,
  ) {
    return this.adminRuleService.findAll({
      industry,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
    });
  }

  @Get("industries")
  getIndustries() {
    return this.adminRuleService.getIndustries();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.adminRuleService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      industry: string;
      industryName: string;
      subCategory?: string;
      pattern: string;
      priority?: number;
    },
  ) {
    return this.adminRuleService.create(body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body()
    body: {
      industry?: string;
      industryName?: string;
      subCategory?: string;
      pattern?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminRuleService.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.adminRuleService.remove(id);
  }
}
