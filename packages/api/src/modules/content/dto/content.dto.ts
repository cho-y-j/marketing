import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum, IsArray } from "class-validator";

export class GenerateContentDto {
  @ApiProperty({
    enum: ["PLACE_POST", "REVIEW_REPLY", "SNS_POST", "BLOG_POST"],
    example: "PLACE_POST",
  })
  @IsString()
  type!: string;

  @ApiProperty({ required: false, description: "추가 지시사항" })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiProperty({ required: false, description: "타겟 키워드", type: [String] })
  @IsOptional()
  @IsArray()
  targetKeywords?: string[];
}

export class UpdateContentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty({ enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
