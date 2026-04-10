import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsUrl } from "class-validator";

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
