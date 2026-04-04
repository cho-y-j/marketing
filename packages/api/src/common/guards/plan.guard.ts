import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma.service";
import { SubscriptionPlan } from "@prisma/client";

export const PLAN_KEY = "requiredPlan";
export const RequirePlan = (plan: SubscriptionPlan) =>
  SetMetadata(PLAN_KEY, plan);

// 플랜별 기능 제한
export const PLAN_LIMITS: Record<
  SubscriptionPlan,
  {
    stores: number;
    analysis: number;
    competitors: number;
    contentGeneration: number;
    keywords: number;
    apiKeyIntegration: boolean;
  }
> = {
  FREE: {
    stores: 1,
    analysis: 1,
    competitors: 3,
    contentGeneration: 3,
    keywords: 10,
    apiKeyIntegration: false,
  },
  BASIC: {
    stores: 3,
    analysis: 5,
    competitors: 10,
    contentGeneration: 30,
    keywords: 50,
    apiKeyIntegration: false,
  },
  PREMIUM: {
    stores: 10,
    analysis: -1, // 무제한
    competitors: -1,
    contentGeneration: -1,
    keywords: -1,
    apiKeyIntegration: true,
  },
};

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.get<SubscriptionPlan>(
      PLAN_KEY,
      context.getHandler(),
    );
    if (!requiredPlan) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) return false;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true },
    });
    if (!user) return false;

    const planOrder: Record<SubscriptionPlan, number> = {
      FREE: 0,
      BASIC: 1,
      PREMIUM: 2,
    };

    if (planOrder[user.subscriptionPlan] < planOrder[requiredPlan]) {
      throw new ForbiddenException(
        `이 기능은 ${requiredPlan} 플랜 이상에서 사용 가능합니다`,
      );
    }

    return true;
  }
}
