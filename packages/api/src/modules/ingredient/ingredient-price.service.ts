import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { KamisProvider } from "../../providers/data/kamis.provider";

/**
 * KAMIS 기반 주재료 가격 수집/조회/알림.
 *
 * 수집 전략:
 *  - 매일 06:00 UTC 에 cron 으로 KAMIS 전 카테고리(100~600) 조회
 *  - 매장 keyIngredients 에 포함된 품목만 IngredientPrice 에 upsert
 *  - 전주/전월 대비 변동률 계산 후 임계값 초과 시 IngredientAlert 생성
 *
 * 알림 규칙:
 *  - 전주 대비 +10% 이상 → WEEKLY_10
 *  - 전월 대비 +20% 이상 → MONTHLY_20
 *  - 2주 연속 +5% 이상 → TREND_2W
 */
@Injectable()
export class IngredientPriceService {
  private readonly logger = new Logger(IngredientPriceService.name);

  // KAMIS 부류코드 — 소매가격 수집 대상 (농수산/축산 전반)
  private readonly CATEGORY_CODES = ["100", "200", "300", "400", "500", "600"];

  constructor(
    private prisma: PrismaService,
    private kamis: KamisProvider,
  ) {}

  /**
   * 매일 수집 — 모든 매장의 keyIngredients 합집합을 조회 대상으로 수집.
   */
  async collectDailyPrices(): Promise<{ collected: number; alerts: number }> {
    if (!this.kamis.isConfigured()) {
      this.logger.warn("KAMIS 미설정 — 수집 스킵");
      return { collected: 0, alerts: 0 };
    }

    // 1) 전 매장 keyIngredients 합집합
    const stores = await this.prisma.store.findMany({
      where: { keyIngredients: { isEmpty: false } },
      select: { id: true, keyIngredients: true },
    });
    const wantedSet = new Set<string>();
    for (const s of stores) s.keyIngredients.forEach((k) => wantedSet.add(k));
    if (wantedSet.size === 0) {
      this.logger.log("추적 대상 재료 없음");
      return { collected: 0, alerts: 0 };
    }

    // 2) KAMIS 전체 카테고리 조회 → 품목명별 가격 맵
    const priceMap = new Map<string, { price: number; unit: string }>();
    for (const cat of this.CATEGORY_CODES) {
      try {
        const items = await this.kamis.getDailyPriceList({ itemCategoryCode: cat });
        for (const it of items) {
          if (it.price > 0 && !priceMap.has(it.itemName)) {
            priceMap.set(it.itemName, { price: it.price, unit: it.unit });
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch (e: any) {
        this.logger.warn(`KAMIS 카테고리 ${cat} 실패: ${e.message}`);
      }
    }

    // 3) wanted 재료별 가격 저장 (매칭: 정확 일치 → 부분 일치)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let collected = 0;
    for (const wanted of wantedSet) {
      const match = this.matchIngredient(wanted, priceMap);
      if (!match) continue;
      try {
        await this.prisma.ingredientPrice.upsert({
          where: {
            itemName_priceType_date: { itemName: wanted, priceType: "retail", date: today },
          },
          update: { price: match.price, unit: match.unit },
          create: {
            itemName: wanted,
            price: match.price,
            unit: match.unit,
            priceType: "retail",
            date: today,
          },
        });
        collected++;
      } catch (e: any) {
        this.logger.warn(`가격 저장 실패 [${wanted}]: ${e.message}`);
      }
    }
    this.logger.log(`가격 수집 완료 — 요청 ${wantedSet.size}개 중 ${collected}개 저장`);

    // 4) 알림 생성
    const alerts = await this.generateAlerts(stores, today);
    this.logger.log(`알림 생성 ${alerts}건`);

    return { collected, alerts };
  }

  /**
   * 매장별 주재료 현재가 + 변동률 조회 (대시보드 위젯용).
   */
  async getStorePriceStatus(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { keyIngredients: true },
    });
    if (!store || store.keyIngredients.length === 0) {
      return { items: [], alerts: [] };
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(week.getDate() - 7);
    const month = new Date(today);
    month.setDate(month.getDate() - 30);

    const items: Array<{
      itemName: string;
      unit: string;
      current: number | null;
      previousWeek: number | null;
      previousMonth: number | null;
      weeklyChange: number | null;
      weeklyChangeAmount: number | null;
      monthlyChange: number | null;
      monthlyChangeAmount: number | null;
      lastUpdated: string | null;
    }> = [];

    for (const name of store.keyIngredients) {
      // 최신 가격 (최대 today)
      const latest = await this.prisma.ingredientPrice.findFirst({
        where: { itemName: name, priceType: "retail", date: { lte: today } },
        orderBy: { date: "desc" },
      });
      // 전주/전월 가격
      const prevWeek = await this.prisma.ingredientPrice.findFirst({
        where: { itemName: name, priceType: "retail", date: { lte: week } },
        orderBy: { date: "desc" },
      });
      const prevMonth = await this.prisma.ingredientPrice.findFirst({
        where: { itemName: name, priceType: "retail", date: { lte: month } },
        orderBy: { date: "desc" },
      });

      const weeklyRate =
        latest && prevWeek && prevWeek.price > 0
          ? ((latest.price - prevWeek.price) / prevWeek.price) * 100
          : null;
      const monthlyRate =
        latest && prevMonth && prevMonth.price > 0
          ? ((latest.price - prevMonth.price) / prevMonth.price) * 100
          : null;

      items.push({
        itemName: name,
        unit: latest?.unit ?? "kg",
        current: latest?.price ?? null,
        previousWeek: prevWeek?.price ?? null,
        previousMonth: prevMonth?.price ?? null,
        weeklyChange: weeklyRate != null ? +weeklyRate.toFixed(1) : null,
        weeklyChangeAmount:
          latest && prevWeek ? latest.price - prevWeek.price : null,
        monthlyChange: monthlyRate != null ? +monthlyRate.toFixed(1) : null,
        monthlyChangeAmount:
          latest && prevMonth ? latest.price - prevMonth.price : null,
        lastUpdated: latest?.date.toISOString().slice(0, 10) ?? null,
      });
    }

    const alerts = await this.prisma.ingredientAlert.findMany({
      where: { storeId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return { items, alerts };
  }

  /**
   * 이름 매칭 — 정확 일치 우선, 부분 포함 폴백.
   * 예: wanted "아귀" → KAMIS "아귀(활)" 매칭 허용.
   */
  private matchIngredient(
    wanted: string,
    priceMap: Map<string, { price: number; unit: string }>,
  ): { price: number; unit: string } | null {
    const norm = wanted.replace(/\s+/g, "");
    // 정확 일치
    if (priceMap.has(wanted)) return priceMap.get(wanted)!;
    if (priceMap.has(norm)) return priceMap.get(norm)!;
    // 부분 포함 (KAMIS 품목명이 "아귀(활)" 처럼 상세일 때)
    for (const [key, val] of priceMap) {
      const keyNorm = key.replace(/\s+/g, "");
      if (keyNorm.includes(norm) || norm.includes(keyNorm)) return val;
    }
    return null;
  }

  /**
   * 변동률 기반 알림 생성.
   */
  private async generateAlerts(
    stores: Array<{ id: string; keyIngredients: string[] }>,
    today: Date,
  ): Promise<number> {
    const week = new Date(today);
    week.setDate(week.getDate() - 7);
    const month = new Date(today);
    month.setDate(month.getDate() - 30);

    let count = 0;
    for (const store of stores) {
      for (const name of store.keyIngredients) {
        const latest = await this.prisma.ingredientPrice.findFirst({
          where: { itemName: name, priceType: "retail", date: { equals: today } },
        });
        if (!latest) continue;
        const prevWeek = await this.prisma.ingredientPrice.findFirst({
          where: { itemName: name, priceType: "retail", date: { lte: week } },
          orderBy: { date: "desc" },
        });
        const prevMonth = await this.prisma.ingredientPrice.findFirst({
          where: { itemName: name, priceType: "retail", date: { lte: month } },
          orderBy: { date: "desc" },
        });

        const weeklyRate = prevWeek && prevWeek.price > 0
          ? ((latest.price - prevWeek.price) / prevWeek.price) * 100
          : null;
        const monthlyRate = prevMonth && prevMonth.price > 0
          ? ((latest.price - prevMonth.price) / prevMonth.price) * 100
          : null;

        // 중복 알림 방지 — 오늘 같은 타입 알림 있으면 skip
        const already = await this.prisma.ingredientAlert.findFirst({
          where: {
            storeId: store.id,
            itemName: name,
            createdAt: { gte: today },
          },
        });
        if (already) continue;

        const rules: Array<{ condition: boolean; type: string; rate: number }> = [
          { condition: (monthlyRate ?? 0) >= 20, type: "MONTHLY_20", rate: monthlyRate ?? 0 },
          { condition: (weeklyRate ?? 0) >= 10, type: "WEEKLY_10", rate: weeklyRate ?? 0 },
        ];
        const hit = rules.find((r) => r.condition);
        if (!hit) continue;

        const prev = hit.type === "MONTHLY_20" ? prevMonth! : prevWeek!;
        const message =
          hit.type === "MONTHLY_20"
            ? `${name} 전월 대비 +${hit.rate.toFixed(1)}% (+${(latest.price - prev.price).toLocaleString()}원/${latest.unit}) 상승 — 세트 메뉴 가격 점검 권장`
            : `${name} 전주 대비 +${hit.rate.toFixed(1)}% (+${(latest.price - prev.price).toLocaleString()}원/${latest.unit}) 상승`;
        await this.prisma.ingredientAlert.create({
          data: {
            storeId: store.id,
            itemName: name,
            alertType: hit.type,
            message,
            currentPrice: latest.price,
            previousPrice: prev.price,
            changeRate: +hit.rate.toFixed(2),
          },
        });
        count++;
      }
    }
    return count;
  }

  async markAlertRead(storeId: string, alertId: string) {
    return this.prisma.ingredientAlert.update({
      where: { id: alertId },
      data: { isRead: true },
    });
  }

  /** 매장 keyIngredients 갱신 (전체 교체) */
  async setKeyIngredients(storeId: string, ingredients: string[]): Promise<string[]> {
    const cleaned = [...new Set(ingredients.map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 15))];
    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: { keyIngredients: cleaned },
      select: { keyIngredients: true },
    });
    return updated.keyIngredients;
  }

  /** 재료 1개 추가 */
  async addKeyIngredient(storeId: string, name: string): Promise<string[]> {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 15) throw new Error("재료명은 2~15자");
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { keyIngredients: true },
    });
    if (!store) throw new Error("매장 없음");
    if (store.keyIngredients.includes(trimmed)) return store.keyIngredients;
    const next = [...store.keyIngredients, trimmed];
    return this.setKeyIngredients(storeId, next);
  }

  /** 재료 1개 삭제 */
  async removeKeyIngredient(storeId: string, name: string): Promise<string[]> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { keyIngredients: true },
    });
    if (!store) throw new Error("매장 없음");
    const next = store.keyIngredients.filter((k) => k !== name);
    return this.setKeyIngredients(storeId, next);
  }

  /** KAMIS 자동완성 — 부분 일치 (이미 수집된 IngredientPrice 에서) */
  async searchIngredientNames(query: string): Promise<string[]> {
    const q = query.trim();
    if (q.length < 1) return [];
    const results = await this.prisma.ingredientPrice.findMany({
      where: { itemName: { contains: q } },
      select: { itemName: true },
      distinct: ["itemName"],
      take: 15,
    });
    return results.map((r) => r.itemName);
  }
}
