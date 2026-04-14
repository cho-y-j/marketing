import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma.module";
import { AdminUserController } from "./admin-user.controller";
import { AdminUserService } from "./admin-user.service";
import { AdminRuleController } from "./admin-rule.controller";
import { AdminRuleService } from "./admin-rule.service";

@Module({
  imports: [PrismaModule],
  controllers: [AdminUserController, AdminRuleController],
  providers: [AdminUserService, AdminRuleService],
})
export class AdminModule {}
