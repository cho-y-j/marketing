import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../common/prisma.service";
import * as bcrypt from "bcrypt";

// Prisma 모킹
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue("mock-jwt-token"),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("새 사용자를 생성하고 토큰을 반환한다", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        name: "테스트",
      });

      const result = await service.register({
        email: "test@test.com",
        password: "test1234",
        name: "테스트",
      });

      expect(result.user.email).toBe("test@test.com");
      expect(result.token).toBe("mock-jwt-token");
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it("이미 존재하는 이메일이면 ConflictException", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.register({ email: "test@test.com", password: "test1234" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    it("올바른 자격증명으로 토큰을 반환한다", async () => {
      const hashed = await bcrypt.hash("test1234", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        name: "테스트",
        password: hashed,
      });

      const result = await service.login({
        email: "test@test.com",
        password: "test1234",
      });

      expect(result.token).toBe("mock-jwt-token");
    });

    it("잘못된 비밀번호면 UnauthorizedException", async () => {
      const hashed = await bcrypt.hash("correct", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        password: hashed,
      });

      await expect(
        service.login({ email: "test@test.com", password: "wrong" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
