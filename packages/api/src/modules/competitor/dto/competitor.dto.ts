import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum } from "class-validator";

export class CreateCompetitorDto {
  @ApiProperty({ example: "옆집 고깃집" })
  @IsString()
  competitorName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  competitorPlaceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  competitorUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;
}
