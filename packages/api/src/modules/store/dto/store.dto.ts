import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsUrl, IsArray, ArrayMaxSize } from "class-validator";

export class CreateStoreDto {
  @ApiProperty({ example: "맛있는 고깃집", description: "매장명" })
  @IsString()
  name!: string;

  @ApiProperty({
    example: "https://map.naver.com/v5/entry/place/1234567890",
    required: false,
    description: "네이버 플레이스 URL",
  })
  @IsOptional()
  @IsString()
  naverPlaceUrl?: string;

  @ApiProperty({ example: "음식점", required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: "고기/구이", required: false })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiProperty({ example: "서울시 마포구 와우산로 123", required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: "홍대", required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({
    example: ["신길역 맛집", "신길역 회식", "신길역 삼겹살"],
    required: false,
    description: "사장님이 직접 입력한 키워드 (선택). 비어있으면 AI 자동 생성. 입력 시 우선 저장",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  customKeywords?: string[];

  @ApiProperty({
    example: ["철산장", "최선도 여의도본점"],
    required: false,
    description: "사장님이 직접 입력한 경쟁매장 이름 또는 URL (선택). 비어있으면 AI 자동 탐색",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  customCompetitorNames?: string[];
}

export class UpdateStoreDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  naverPlaceUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ required: false, description: "스마트플레이스 Biz ID" })
  @IsOptional()
  @IsString()
  smartPlaceBizId?: string;
}
