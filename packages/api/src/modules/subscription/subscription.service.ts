import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { SubscriptionPlan } from "@prisma/client";
import { UpgradeDto, RegisterApiKeyDto } from "./dto/subscription.dto";

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async getSubscription(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionPlan: true,
        subscriptionEndAt: true,
        anthropicApiKey: true,
      },
    });
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
    // TODO: 암호화 처리
    return this.prisma.user.update({
      where: { id: userId },
      data: { anthropicApiKey: dto.apiKey },
      select: { id: true },
    });
  }
}
