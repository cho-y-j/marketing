import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { CryptoService } from "../../common/crypto.service";
import { SubscriptionPlan } from "@prisma/client";
import { UpgradeDto, RegisterApiKeyDto } from "./dto/subscription.dto";
import axios from "axios";

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionPlan: true,
        subscriptionEndAt: true,
        anthropicApiKey: true,
      },
    });
    if (!user) return null;
    // 마스킹 후 반환 (평문 노출 금지)
    let maskedKey: string | null = null;
    if (user.anthropicApiKey) {
      try {
        const dec = this.crypto.decrypt(user.anthropicApiKey);
        maskedKey = this.crypto.mask(dec);
      } catch {
        maskedKey = "복호화 실패 — 재등록 필요";
      }
    }
    return {
      subscriptionPlan: user.subscriptionPlan,
      subscriptionEndAt: user.subscriptionEndAt,
      anthropicApiKeyMasked: maskedKey,
      hasApiKey: !!user.anthropicApiKey,
    };
  }

  async upgrade(userId: string, dto: UpgradeDto) {
    const endAt = new Date();
    endAt.setMonth(endAt.getMonth() + 1);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionPlan: dto.plan as SubscriptionPlan,
        subscriptionEndAt: endAt,
      },
      select: {
        subscriptionPlan: true,
        subscriptionEndAt: true,
      },
    });
  }

  async registerApiKey(userId: string, dto: RegisterApiKeyDto) {
    if (!dto.apiKey || dto.apiKey.trim().length < 20) {
      throw new BadRequestException("유효하지 않은 API 키 형식입니다");
    }
    // 1) 실제 키가 동작하는지 Anthropic 에 ping 검증 (껍데기 등록 금지)
    await this.verifyAnthropicKey(dto.apiKey.trim());

    // 2) 검증 통과 시 AES-256-GCM 으로 암호화하여 저장
    const encrypted = this.crypto.encrypt(dto.apiKey.trim());
    await this.prisma.user.update({
      where: { id: userId },
      data: { anthropicApiKey: encrypted },
      select: { id: true },
    });
    return {
      success: true,
      maskedKey: this.crypto.mask(dto.apiKey.trim()),
    };
  }

  async deleteApiKey(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { anthropicApiKey: null },
      select: { id: true },
    });
    return { success: true };
  }

  /**
   * AI 호출용 — 사용자 키를 복호화해서 반환.
   * 키가 없으면 null. 호출자가 null 이면 서버 키로 폴백.
   */
  async getDecryptedApiKey(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { anthropicApiKey: true },
    });
    if (!user?.anthropicApiKey) return null;
    try {
      return this.crypto.decrypt(user.anthropicApiKey);
    } catch (e: any) {
      this.logger.error(`API 키 복호화 실패 [user=${userId}]: ${e.message}`);
      return null;
    }
  }

  /**
   * Anthropic API 키 유효성 검증.
   * 1 토큰 짜리 ping 으로 키가 살아있는지 확인.
   * 실패 시 BadRequestException — 사용자에게 명시적 에러 노출.
   */
  private async verifyAnthropicKey(apiKey: string): Promise<void> {
    try {
      await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          timeout: 10000,
        },
      );
    } catch (e: any) {
      const status = e?.response?.status;
      const detail =
        e?.response?.data?.error?.message || e?.message || "알 수 없는 오류";
      if (status === 401) {
        throw new BadRequestException(
          `Anthropic API 키 인증 실패: 키가 유효하지 않습니다. (${detail})`,
        );
      }
      if (status === 429) {
        throw new BadRequestException(
          `Anthropic API 레이트 리밋: 잠시 후 다시 시도해주세요. (${detail})`,
        );
      }
      throw new BadRequestException(
        `Anthropic API 키 검증 실패 (status=${status}): ${detail}`,
      );
    }
  }
}
