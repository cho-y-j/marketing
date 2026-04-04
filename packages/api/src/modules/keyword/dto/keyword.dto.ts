import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum } from "class-validator";

export class CreateKeywordDto {
  @ApiProperty({ example: "홍대 맛집" })
  @IsString()
  keyword!: string;

  @ApiProperty({ enum: ["MAIN", "USER_ADDED"], default: "USER_ADDED", required: false })
  @IsOptional()
  @IsString()
  type?: string;
}
