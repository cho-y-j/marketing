import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SalesService } from "./sales.service";

@ApiTags("매출")
@Controller("stores/:storeId/sales")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private service: SalesService) {}

  @Get()
  @ApiOperation({ summary: "매출 일/주/월 집계" })
  list(
    @Param("storeId") storeId: string,
    @Query("period") period: "day" | "week" | "month" = "day",
  ) {
    if (!["day", "week", "month"].includes(period)) {
      throw new BadRequestException("period 는 day | week | month");
    }
    return this.service.getSales(storeId, period);
  }

  @Get("roi")
  @ApiOperation({ summary: "주간 매출 변화 + 마케팅 활동 AI 인사이트" })
  roi(@Param("storeId") storeId: string) {
    return this.service.getMarketingROI(storeId);
  }

  @Get("missing")
  @ApiOperation({ summary: "최근 N일 중 매출 미입력 날짜 (홈 알림 카드용)" })
  missing(
    @Param("storeId") storeId: string,
    @Query("days") days?: string,
  ) {
    return this.service
      .getMissingDates(storeId, days ? parseInt(days, 10) : 7)
      .then((dates) => ({ days: days ? parseInt(days, 10) : 7, missing: dates }));
  }

  @Post()
  @ApiOperation({ summary: "매출 입력 (또는 OCR 후 사장님 확인 후 저장)" })
  save(
    @Param("storeId") storeId: string,
    @Body()
    body: {
      date: string;
      totalAmount: number;
      cardAmount?: number;
      cashAmount?: number;
      source?: "MANUAL" | "OCR";
      note?: string;
      receiptText?: string;
    },
  ) {
    return this.service.upsertSales(storeId, {
      date: new Date(body.date),
      totalAmount: body.totalAmount,
      cardAmount: body.cardAmount ?? null,
      cashAmount: body.cashAmount ?? null,
      source: body.source ?? "MANUAL",
      note: body.note ?? null,
      receiptText: body.receiptText ?? null,
    });
  }

  @Post("parse-receipt")
  @ApiOperation({ summary: "영수증 사진 (base64) → Vision API + Claude 파싱" })
  parseReceipt(
    @Param("storeId") _storeId: string,
    @Body() body: { imageBase64: string },
  ) {
    if (!body.imageBase64 || body.imageBase64.length < 100) {
      throw new BadRequestException("imageBase64 가 비어있거나 너무 작음");
    }
    // base64 prefix 가 있을 수 있음 (예: "data:image/jpeg;base64,...")
    const stripped = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    return this.service.parseReceiptImage(stripped);
  }
}
