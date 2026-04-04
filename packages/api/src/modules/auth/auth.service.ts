import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
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
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        provider: "email",
      },
    });

    const token = this.generateToken(user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, token };
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
}
