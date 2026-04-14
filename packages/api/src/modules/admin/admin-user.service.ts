import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { UserRole, UserStatus, SubscriptionPlan } from "@prisma/client";

@Injectable()
export class AdminUserService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const { page = 1, limit = 20, search, role, status } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }
    if (role) where.role = role;
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          companyName: true,
          businessNumber: true,
          role: true,
          status: true,
          subscriptionPlan: true,
          suspendedAt: true,
          suspendReason: true,
          createdAt: true,
          _count: { select: { stores: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        companyName: true,
        businessNumber: true,
        profileImage: true,
        role: true,
        status: true,
        subscriptionPlan: true,
        subscriptionEndAt: true,
        suspendedAt: true,
        suspendReason: true,
        naverConnectedAt: true,
        createdAt: true,
        updatedAt: true,
        stores: {
          select: {
            id: true,
            name: true,
            category: true,
            address: true,
            competitiveScore: true,
            setupStatus: true,
            createdAt: true,
          },
        },
        franchiseGroup: {
          select: {
            id: true,
            name: true,
            memberships: {
              select: {
                store: {
                  select: { id: true, name: true, address: true },
                },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다");
    return user;
  }

  async update(id: string, data: {
    name?: string;
    phone?: string;
    companyName?: string;
    businessNumber?: string;
    role?: UserRole;
    subscriptionPlan?: SubscriptionPlan;
  }) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });
  }

  async suspend(id: string, reason?: string) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendReason: reason || "관리자에 의한 정지",
      },
    });
  }

  async activate(id: string) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        suspendedAt: null,
        suspendReason: null,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.DELETED },
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다");
    return user;
  }
}
