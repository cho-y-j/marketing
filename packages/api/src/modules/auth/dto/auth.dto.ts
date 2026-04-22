import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, IsString, MinLength, IsOptional } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "password123" })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: "홍길동", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: "INDIVIDUAL", enum: ["INDIVIDUAL", "FRANCHISE"], required: false })
  @IsOptional()
  @IsIn(["INDIVIDUAL", "FRANCHISE"])
  role?: "INDIVIDUAL" | "FRANCHISE";

  @ApiProperty({ example: "010-1234-5678", required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: "찬란한아구", required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: "123-45-67890", required: false })
  @IsOptional()
  @IsString()
  businessNumber?: string;

  @ApiProperty({ example: "ABC123", required: false, description: "나를 초대한 사람의 추천 코드" })
  @IsOptional()
  @IsString()
  referralCode?: string;
}

export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "password123" })
  @IsString()
  password!: string;
}

export class NaverLoginDto {
  @ApiProperty({ description: "네이버 OAuth 인증 코드" })
  @IsString()
  code!: string;

  @ApiProperty({ description: "상태 토큰" })
  @IsString()
  state!: string;
}
