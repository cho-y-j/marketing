import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ContentService } from "./content.service";
import { GenerateContentDto, UpdateContentDto } from "./dto/content.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("콘텐츠")
@Controller("stores/:storeId/content")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Get()
  @ApiOperation({ summary: "생성된 콘텐츠 목록" })
  findAll(@Param("storeId") storeId: string) {
    return this.contentService.findAll(storeId);
  }

  @Post("generate")
  @ApiOperation({ summary: "AI 콘텐츠 생성" })
  generate(
    @Param("storeId") storeId: string,
    @Body() dto: GenerateContentDto,
  ) {
    return this.contentService.generate(storeId, dto);
  }

  @Put(":contentId")
  @ApiOperation({ summary: "콘텐츠 수정" })
  update(
    @Param("storeId") storeId: string,
    @Param("contentId") contentId: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.contentService.update(storeId, contentId, dto);
  }

  @Delete(":contentId")
  @ApiOperation({ summary: "콘텐츠 삭제" })
  remove(
    @Param("storeId") storeId: string,
    @Param("contentId") contentId: string,
  ) {
    return this.contentService.remove(storeId, contentId);
  }
}
