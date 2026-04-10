import { Controller, Post, Get, Delete, Body, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@ApiTags("인증")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "회원가입" })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @ApiOperation({ summary: "로그인" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 정보 조회" })
  getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }

  // === 네이버 스마트플레이스 연동 ===

  @Get("naver/status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "네이버 연동 상태 확인" })
  getNaverStatus(@Req() req: any) {
    return this.authService.getNaverConnectionStatus(req.user.id);
  }

  @Post("naver/connect")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "네이버 계정 연동 (OAuth 코드 교환)" })
  connectNaver(@Req() req: any, @Body() dto: { code: string; state: string }) {
    return this.authService.connectNaver(req.user.id, dto.code, dto.state);
  }

  @Delete("naver/disconnect")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "네이버 계정 연동 해제" })
  disconnectNaver(@Req() req: any) {
    return this.authService.disconnectNaver(req.user.id);
  }
}
