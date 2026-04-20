import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

const helperLogger = new Logger("AutoAnalysisTargets");

/**
 * 자동 분석/수집/알림 cron 의 대상 매장 규칙 — 단 하나의 소스.
 *
 * 리드젠 퍼널 비즈니스 모델:
 *  - 가입 즉시 네이버 플레이스 분석 = 핵심 가치
 *  - FREE 사용자에게도 반드시 자동 분석 제공 (=무료 분석이 광고 상담으로 이어지는 퍼널)
 *  - 유료 플랜 전용 기능은 plan.guard 로 API 진입점에서만 차단
 *
 * 제외 조건:
 *  - naverPlaceId 없음 → 분석 불가능
 *  - user.status !== ACTIVE → 탈퇴/정지된 사용자
 */
const AUTO_ANALYSIS_WHERE: Prisma.StoreWhereInput = {
  naverPlaceId: { not: null },
  user: { status: "ACTIVE" },
};

export async function findAutoAnalysisStores<
  T extends Prisma.StoreSelect,
>(
  prisma: PrismaService,
  options?: { select?: T; caller?: string },
): Promise<Array<Prisma.StoreGetPayload<{ select: T }>>> {
  const select = (options?.select ?? { id: true, name: true }) as T;
  const stores = (await prisma.store.findMany({
    where: AUTO_ANALYSIS_WHERE,
    select,
  })) as any;

  // 관측성 — "대상 0개로 조용히 skip" 재발 방지.
  // FREE 필터 버그 (04-16~19) 처럼 필터가 잘못돼 아무도 처리 안 되는 경우 WARN 로그로 감지.
  if (stores.length === 0) {
    helperLogger.warn(
      `[${options?.caller ?? "unknown"}] 자동 분석 대상 매장 0개 — 필터 규칙 또는 DB 상태 점검 필요`,
    );
  }

  return stores;
}
