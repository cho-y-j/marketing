import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";

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
