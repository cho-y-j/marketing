import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma.service";
import * as webpush from "web-push";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

/**
 * 통합 푸시 알림 서비스.
 *
 * 지원:
 *  - Web Push (VAPID) — 브라우저 기본. 외부 의존 0.
 *  - FCM — 모바일 앱 / 백업 채널. FIREBASE_SERVICE_ACCOUNT_PATH 가 있으면 활성화.
 *
 * 데이터 모델: PushSubscription (type=webpush|fcm)
 *
 * 정책:
 *  - 키 미설정 시 sendXxx() 호출하면 BadRequestException — 껍데기 발송 금지
 *  - 발송 실패가 410(만료)이면 자동 비활성화
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private vapidConfigured = false;
  private fcmConfigured = false;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    // Web Push (VAPID)
    const vPub = this.config.get<string>("VAPID_PUBLIC_KEY");
    const vPriv = this.config.get<string>("VAPID_PRIVATE_KEY");
    const vSub = this.config.get<string>("VAPID_SUBJECT") || "mailto:admin@marketing.local";
    if (vPub && vPriv) {
      try {
        webpush.setVapidDetails(vSub, vPub, vPriv);
        this.vapidConfigured = true;
        this.logger.log(`Web Push (VAPID) 활성화: subject=${vSub}`);
      } catch (e: any) {
        this.logger.error(`VAPID 설정 실패: ${e.message}`);
      }
    } else {
      this.logger.warn(
        "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY 미설정 — Web Push 비활성",
      );
    }

    // FCM
    const fcmPath = this.config.get<string>("FIREBASE_SERVICE_ACCOUNT_PATH");
    if (fcmPath) {
      try {
        const abs = path.isAbsolute(fcmPath) ? fcmPath : path.resolve(fcmPath);
        if (!fs.existsSync(abs)) {
          this.logger.warn(
            `Firebase service account 파일 없음: ${abs} — FCM 비활성`,
          );
        } else if (admin.apps.length === 0) {
          const sa = JSON.parse(fs.readFileSync(abs, "utf8"));
          admin.initializeApp({ credential: admin.credential.cert(sa) });
          this.fcmConfigured = true;
          this.logger.log(
            `FCM Admin SDK 활성화: project=${sa.project_id}`,
          );
        }
      } catch (e: any) {
        this.logger.error(`FCM 초기화 실패: ${e.message}`);
      }
    } else {
      this.logger.warn(
        "FIREBASE_SERVICE_ACCOUNT_PATH 미설정 — FCM 비활성 (Web Push 만 사용)",
      );
    }
  }

  isVapidConfigured(): boolean {
    return this.vapidConfigured;
  }

  isFcmConfigured(): boolean {
    return this.fcmConfigured;
  }

  /** 클라이언트 구독 등록 */
  async subscribe(
    userId: string,
    payload:
      | {
          type: "webpush";
          endpoint: string;
          keys: { p256dh: string; auth: string };
          userAgent?: string;
        }
      | { type: "fcm"; token: string; userAgent?: string },
  ) {
    if (payload.type === "webpush") {
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        throw new BadRequestException("Web Push 구독 정보가 불완전합니다");
      }
      return this.prisma.pushSubscription.upsert({
        where: { userId_endpoint: { userId, endpoint: payload.endpoint } },
        create: {
          userId,
          type: "webpush",
          endpoint: payload.endpoint,
          keys: payload.keys,
          userAgent: payload.userAgent,
          enabled: true,
        },
        update: {
          keys: payload.keys,
          enabled: true,
          userAgent: payload.userAgent,
          lastUsedAt: new Date(),
        },
      });
    } else {
      if (!payload.token) {
        throw new BadRequestException("FCM 토큰이 비어있습니다");
      }
      // FCM 은 endpoint 컬럼에 token 을 넣어 unique 강제
      return this.prisma.pushSubscription.upsert({
        where: { userId_endpoint: { userId, endpoint: `fcm:${payload.token}` } },
        create: {
          userId,
          type: "fcm",
          endpoint: `fcm:${payload.token}`,
          token: payload.token,
          userAgent: payload.userAgent,
          enabled: true,
        },
        update: {
          enabled: true,
          userAgent: payload.userAgent,
          lastUsedAt: new Date(),
        },
      });
    }
  }

  async unsubscribe(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.update({
      where: { userId_endpoint: { userId, endpoint } },
      data: { enabled: false },
    });
  }

  /**
   * 사용자에게 알림 발송 (모든 활성 구독으로).
   * @returns {sent, failed, channels}
   */
  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, any>; url?: string },
  ): Promise<{ sent: number; failed: number; channels: string[] }> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, enabled: true },
    });
    if (subs.length === 0) {
      this.logger.warn(`[user=${userId}] 활성 구독 없음 — 푸시 발송 스킵`);
      return { sent: 0, failed: 0, channels: [] };
    }

    let sent = 0;
    let failed = 0;
    const channels: string[] = [];

    for (const sub of subs) {
      try {
        if (sub.type === "webpush") {
          if (!this.vapidConfigured) {
            throw new Error("vapid_not_configured");
          }
          const subscription = {
            endpoint: sub.endpoint!,
            keys: sub.keys as any,
          };
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              data: { ...payload.data, url: payload.url },
            }),
            { TTL: 24 * 3600 },
          );
          sent++;
          channels.push("webpush");
        } else if (sub.type === "fcm") {
          if (!this.fcmConfigured) {
            throw new Error("fcm_not_configured");
          }
          await admin.messaging().send({
            token: sub.token!,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: this.flattenData(payload.data),
            webpush: payload.url
              ? { fcmOptions: { link: payload.url } }
              : undefined,
          });
          sent++;
          channels.push("fcm");
        }
        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (e: any) {
        failed++;
        const status = e?.statusCode || e?.code;
        // 만료된 구독은 비활성화
        if (status === 410 || status === 404 || /not_registered|invalid/i.test(e?.message ?? "")) {
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { enabled: false },
          });
          this.logger.warn(
            `[${sub.type}] 만료/무효 구독 비활성화 (sub=${sub.id}): ${e.message}`,
          );
        } else {
          this.logger.error(
            `[${sub.type}] 발송 실패 sub=${sub.id}: ${e.message}`,
          );
        }
      }
    }

    return { sent, failed, channels };
  }

  /** FCM data payload 는 모두 string 이어야 함 */
  private flattenData(data?: Record<string, any>): Record<string, string> {
    if (!data) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    return out;
  }

  /** VAPID 공개 키 — 클라이언트 구독 시 필요 */
  getVapidPublicKey(): string | null {
    return this.config.get<string>("VAPID_PUBLIC_KEY") || null;
  }
}
