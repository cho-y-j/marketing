import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import axios from "axios";
import { PrismaService } from "../../common/prisma.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException("이미 등록된 이메일입니다");
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 추천 코드로 초대자 찾기 (옵션)
    let referredByUserId: string | undefined;
    if (dto.referralCode) {
      const normalized = dto.referralCode.trim().toUpperCase();
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: normalized },
        select: { id: true },
      });
      if (referrer) referredByUserId = referrer.id;
      // 코드 존재 안 하면 조용히 무시 — 가입 자체는 막지 않음
    }

    // 본인 추천 코드 생성 — 중복 시 재시도 (최대 5회)
    let myCode = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateReferralCode();
      const exists = await this.prisma.user.findUnique({
        where: { referralCode: candidate },
        select: { id: true },
      });
      if (!exists) {
        myCode = candidate;
        break;
      }
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        provider: "email",
        role: dto.role ?? "INDIVIDUAL",
        phone: dto.phone,
        companyName: dto.companyName,
        businessNumber: dto.businessNumber,
        referralCode: myCode || null,
        referredByUserId,
      },
    });

    const token = this.generateToken(user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  async getMyReferral(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referralCode: true,
        points: true,
        referredUsers: {
          select: { id: true, email: true, name: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!user) throw new UnauthorizedException("사용자를 찾을 수 없습니다");

    // 추천 코드 없으면 즉시 생성 (기존 가입자 백필)
    if (!user.referralCode) {
      for (let i = 0; i < 5; i++) {
        const candidate = generateReferralCode();
        const exists = await this.prisma.user.findUnique({
          where: { referralCode: candidate },
          select: { id: true },
        });
        if (!exists) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { referralCode: candidate },
          });
          user.referralCode = candidate;
          break;
        }
      }
    }

    return {
      referralCode: user.referralCode,
      points: user.points,
      invitedCount: user.referredUsers.length,
      invitedUsers: user.referredUsers.map((u) => ({
        id: u.id,
        name: u.name || u.email.split("@")[0],
        joinedAt: u.createdAt,
      })),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.password) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다");
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다");
    }

    const token = this.generateToken(user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        profileImage: true,
        subscriptionPlan: true,
        subscriptionEndAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException("사용자를 찾을 수 없습니다");
    return user;
  }

  private generateToken(userId: string): string {
    return this.jwtService.sign({ sub: userId });
  }

  // === 네이버 스마트플레이스 연동 ===

  async getNaverConnectionStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        naverAccessToken: true,
        naverConnectedAt: true,
        naverTokenExpiresAt: true,
      },
    });
    if (!user) throw new UnauthorizedException();

    const connected = !!user.naverAccessToken;
    const expired = user.naverTokenExpiresAt
      ? new Date() > user.naverTokenExpiresAt
      : false;

    return {
      connected,
      connectedAt: user.naverConnectedAt,
      expired,
    };
  }

  async connectNaver(userId: string, code: string, state: string) {
    const clientId = process.env.NAVER_OAUTH_CLIENT_ID;
    const clientSecret = process.env.NAVER_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException("네이버 OAuth 설정이 되어있지 않습니다");
    }

    // 1. code → access_token 교환
    let tokenData: any;
    try {
      const resp = await axios.post(
        "https://nid.naver.com/oauth2.0/token",
        null,
        {
          params: {
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            code,
            state,
          },
          timeout: 10000,
        },
      );
      tokenData = resp.data;
    } catch (e: any) {
      this.logger.error(`네이버 토큰 교환 실패: ${e.message}`);
      throw new BadRequestException("네이버 인증에 실패했습니다. 다시 시도해주세요.");
    }

    if (tokenData.error) {
      this.logger.error(`네이버 토큰 에러: ${tokenData.error} - ${tokenData.error_description}`);
      throw new BadRequestException(
        tokenData.error_description || "네이버 인증에 실패했습니다",
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;

    // 2. access_token으로 프로필 확인 (연동 검증)
    try {
      const profileResp = await axios.get(
        "https://openapi.naver.com/v1/nid/me",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        },
      );
      this.logger.log(
        `네이버 연동 성공: ${profileResp.data?.response?.name || "unknown"}`,
      );
    } catch (e: any) {
      this.logger.error(`네이버 프로필 조회 실패: ${e.message}`);
      throw new BadRequestException("네이버 계정 확인에 실패했습니다");
    }

    // 3. DB에 토큰 저장
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        naverAccessToken: accessToken,
        naverRefreshToken: refreshToken,
        naverTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        naverConnectedAt: new Date(),
      },
    });

    return { success: true, message: "네이버 계정이 연동되었습니다" };
  }

  async disconnectNaver(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { naverAccessToken: true },
    });

    // 네이버에 토큰 폐기 요청
    if (user?.naverAccessToken) {
      try {
        await axios.post("https://nid.naver.com/oauth2.0/token", null, {
          params: {
            grant_type: "delete",
            client_id: process.env.NAVER_OAUTH_CLIENT_ID,
            client_secret: process.env.NAVER_OAUTH_CLIENT_SECRET,
            access_token: user.naverAccessToken,
            service_provider: "NAVER",
          },
          timeout: 10000,
        });
      } catch (e: any) {
        this.logger.warn(`네이버 토큰 폐기 실패 (무시): ${e.message}`);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        naverAccessToken: null,
        naverRefreshToken: null,
        naverTokenExpiresAt: null,
        naverConnectedAt: null,
      },
    });

    return { success: true, message: "네이버 연동이 해제되었습니다" };
  }

  // 네이버 토큰 갱신 (refresh)
  async refreshNaverToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { naverRefreshToken: true },
    });
    if (!user?.naverRefreshToken) return null;

    try {
      const resp = await axios.post("https://nid.naver.com/oauth2.0/token", null, {
        params: {
          grant_type: "refresh_token",
          client_id: process.env.NAVER_OAUTH_CLIENT_ID,
          client_secret: process.env.NAVER_OAUTH_CLIENT_SECRET,
          refresh_token: user.naverRefreshToken,
        },
        timeout: 10000,
      });

      const newToken = resp.data.access_token;
      const expiresIn = resp.data.expires_in || 3600;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          naverAccessToken: newToken,
          naverTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        },
      });

      return newToken;
    } catch (e: any) {
      this.logger.error(`네이버 토큰 갱신 실패: ${e.message}`);
      return null;
    }
  }
}

/** 추천 코드 — 대문자+숫자 6자리. 0/O/I/1 같이 헷갈리는 문자 제외 */
function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
