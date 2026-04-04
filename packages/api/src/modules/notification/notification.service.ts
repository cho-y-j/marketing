import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {}

  async create(
    userId: string,
    data: { type: string; title: string; message: string; data?: any },
  ) {
    return this.prisma.notification.create({
      data: { userId, ...data },
    });
  }

  async getUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async getAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  // 순위 변동 알림 생성
  async createRankChangeAlert(
    userId: string,
    keyword: string,
    prevRank: number,
    newRank: number,
  ) {
    const diff = prevRank - newRank;
    const isUp = diff > 0;
    return this.create(userId, {
      type: "RANK_CHANGE",
      title: isUp
        ? `"${keyword}" 순위 ${diff}단계 상승!`
        : `"${keyword}" 순위 ${Math.abs(diff)}단계 하락`,
      message: `${prevRank}위 → ${newRank}위`,
      data: { keyword, prevRank, newRank, diff },
    });
  }
}
