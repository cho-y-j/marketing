import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsEnum } from "class-validator";

export class UpgradeDto {
  @ApiProperty({ enum: ["BASIC", "PREMIUM"], example: "BASIC" })
  @IsString()
  plan!: string;
}

export class RegisterApiKeyDto {
  @ApiProperty({ description: "Anthropic API 키" })
  @IsString()
  apiKey!: string;
}
