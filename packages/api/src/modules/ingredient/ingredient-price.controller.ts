import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { IngredientPriceService } from "./ingredient-price.service";

@ApiTags("주재료 가격")
@Controller("stores/:storeId/ingredients")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IngredientPriceController {
  constructor(private service: IngredientPriceService) {}

  @Get("prices")
  @ApiOperation({ summary: "매장 주재료 가격 현황 (위젯용)" })
  async getPrices(@Param("storeId") storeId: string) {
    return this.service.getStorePriceStatus(storeId);
  }

  @Post("prices/collect")
  @ApiOperation({ summary: "가격 수집 수동 트리거 (슈퍼관리자용)" })
  async collect() {
    return this.service.collectDailyPrices();
  }

  @Post("alerts/:alertId/read")
  @ApiOperation({ summary: "가격 알림 읽음 처리" })
  markRead(
    @Param("storeId") storeId: string,
    @Param("alertId") alertId: string,
  ) {
    return this.service.markAlertRead(storeId, alertId);
  }
}
