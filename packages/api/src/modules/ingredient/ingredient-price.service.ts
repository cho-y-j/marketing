import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { KamisProvider } from "../../providers/data/kamis.provider";
import { findCategoryCode } from "./kamis-catalog";

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

    // 2) KAMIS 전체 카테고리 조회 → 품목명별 가격 맵 (오늘 + 1주전 + 1개월전)
    type PriceEntry = { price: number; unit: string; week: number; month: number };
    const priceMap = new Map<string, PriceEntry>();
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const cat of this.CATEGORY_CODES) {
      try {
        // getMultiPointPrices 가 dpr1/dpr3/dpr5 시계열 반환
        const items = await this.kamis.getMultiPointPrices(cat, todayStr);
        for (const it of items) {
          if (!priceMap.has(it.itemName)) {
            priceMap.set(it.itemName, {
              price: it.today,
              unit: it.unit,
              week: it.week,
              month: it.month,
            });
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch (e: any) {
        this.logger.warn(`KAMIS 카테고리 ${cat} 실패: ${e.message}`);
      }
    }

    // 3) wanted 재료별 가격 저장 (매칭: 정확 일치 → 부분 일치)
    //    priceWeekAgo/priceMonthAgo 함께 저장 → 1일치 수집만으로도 변동률 계산 가능.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let collected = 0;
    for (const wanted of wantedSet) {
      const match = this.matchIngredientWithSeries(wanted, priceMap);
      if (!match) continue;
      try {
        await this.prisma.ingredientPrice.upsert({
          where: {
            itemName_priceType_date: { itemName: wanted, priceType: "retail", date: today },
          },
          update: {
            price: match.price,
            unit: match.unit,
            priceWeekAgo: match.week > 0 ? match.week : null,
            priceMonthAgo: match.month > 0 ? match.month : null,
          },
          create: {
            itemName: wanted,
            price: match.price,
            unit: match.unit,
            priceWeekAgo: match.week > 0 ? match.week : null,
            priceMonthAgo: match.month > 0 ? match.month : null,
            priceType: "retail",
            date: today,
          },
        });
        collected++;
      } catch (e: any) {
        this.logger.warn(`가격 저장 실패 [${wanted}]: ${e.message}`);
      }
    }
    this.logger.log(`가격 수집 완료 — 요청 ${wantedSet.size}개 중 ${collected}개 저장 (시계열 포함)`);

    // 4) 알림 생성
    const alerts = await this.generateAlerts(stores, today);
    this.logger.log(`알림 생성 ${alerts}건`);

    return { collected, alerts };
  }

  /**
   * 매장별 주재료 현재가 + 변동률 조회.
   *
   * KAMIS API 응답의 시계열 필드(dpr1/dpr3/dpr5)를 실시간 활용.
   * DB 누적 데이터 없이도 즉시 전주/전월 변동률 계산 가능.
   * Redis 캐시(KamisProvider 내부 12h) 활용으로 중복 호출 방지.
   */
  async getStorePriceStatus(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { keyIngredients: true },
    });
    if (!store || store.keyIngredients.length === 0) {
      return { items: [], alerts: [] };
    }

    const today = new Date().toISOString().slice(0, 10);

    // KAMIS 라이브 호출 — 각 카테고리 1회씩 (12h Redis 캐시). today/week/month 시계열.
    // today=0 이어도 week/month 가 있으면 반환됨 (KAMIS provider 에서 filter 완화).
    const categoryCache = new Map<
      string,
      Array<{ itemName: string; kindName: string; unit: string; today: number; week: number; month: number }>
    >();
    const ensureCategory = async (code: string) => {
      if (categoryCache.has(code)) return categoryCache.get(code)!;
      try {
        const list = await this.kamis.getMultiPointPrices(code, today);
        categoryCache.set(code, list);
        return list;
      } catch (e: any) {
        this.logger.warn(`KAMIS ${code} 조회 실패: ${e.message}`);
        categoryCache.set(code, []);
        return [];
      }
    };

    // 재료 이름 → 카탈로그 카테고리 조회 (못 찾으면 전 카테고리 전수 매칭)
    const findMatch = async (name: string) => {
      const norm = name.replace(/\s+/g, "");
      const check = (
        list: Array<{ itemName: string; kindName: string; unit: string; today: number; week: number; month: number }>,
      ) => {
        let m = list.find((it) => it.itemName.replace(/\s+/g, "") === norm);
        if (!m) {
          m = list.find((it) => {
            const itn = it.itemName.replace(/\s+/g, "");
            return itn.includes(norm) || norm.includes(itn);
          });
        }
        return m;
      };

      const code = findCategoryCode(name);
      if (code) {
        const list = await ensureCategory(code);
        const m = check(list);
        if (m) return m;
      }
      // 카탈로그 매칭 실패 시 전 카테고리 전수 조사 (캐시 활용)
      for (const c of ["100", "200", "300", "400", "500", "600"]) {
        if (c === code) continue;
        const list = await ensureCategory(c);
        const m = check(list);
        if (m) return m;
      }
      return null;
    };

    const items: Array<any> = [];
    // DB fallback 헬퍼 — KAMIS 라이브가 0 또는 매칭 실패 시 가장 최근 정상 가격으로 보강.
    const dbFallback = async (name: string) => {
      const last = await this.prisma.ingredientPrice.findFirst({
        where: { itemName: name, price: { gt: 0 } },
        orderBy: { date: "desc" },
        select: {
          price: true,
          unit: true,
          priceWeekAgo: true,
          priceMonthAgo: true,
          date: true,
        },
      });
      return last;
    };
    for (const name of store.keyIngredients) {
      const matched = await findMatch(name);

      // KAMIS 매칭 실패 또는 today=0 — DB fallback 우선시
      // (KAMIS 가 today=0 으로 응답하는 경우 = 오늘 데이터 미업데이트 → DB 마지막 정상값이 더 정확)
      const noLiveData = !matched || matched.today <= 0;

      if (noLiveData) {
        const last = await dbFallback(name);
        if (last) {
          // DB 에 저장된 시계열 값으로 변동률 계산
          const wk = last.priceWeekAgo;
          const mo = last.priceMonthAgo;
          const weeklyChange =
            wk != null && wk > 0 ? ((last.price - wk) / wk) * 100 : null;
          const monthlyChange =
            mo != null && mo > 0 ? ((last.price - mo) / mo) * 100 : null;
          items.push({
            itemName: name,
            unit: last.unit,
            current: last.price,
            previousWeek: wk,
            previousMonth: mo,
            weeklyChange: weeklyChange != null ? +weeklyChange.toFixed(1) : null,
            weeklyChangeAmount:
              weeklyChange != null && wk != null ? last.price - wk : null,
            weeklySuspicious: weeklyChange != null && Math.abs(weeklyChange) > 30,
            monthlyChange: monthlyChange != null ? +monthlyChange.toFixed(1) : null,
            monthlyChangeAmount:
              monthlyChange != null && mo != null ? last.price - mo : null,
            monthlySuspicious: monthlyChange != null && Math.abs(monthlyChange) > 50,
            lastUpdated: last.date.toISOString().slice(0, 10),
          });
        } else {
          items.push({
            itemName: name,
            unit: matched?.unit ?? "",
            current: null,
            previousWeek: null,
            previousMonth: null,
            weeklyChange: null,
            weeklyChangeAmount: null,
            monthlyChange: null,
            monthlyChangeAmount: null,
            lastUpdated: null,
          });
        }
        continue;
      }

      // KAMIS 제공 실가격: today/week/month — 추정/계산 없음, 그대로 사용.
      // today 가 아직 업데이트 안 됐으면 week 를 "현재가"로 대체 (어제 값 표기).
      const current = matched.today > 0 ? matched.today : matched.week > 0 ? matched.week : matched.month > 0 ? matched.month : null;

      // 변동률은 today > 0 일 때만 계산 (current 가 week 로 대체된 경우 전주 비교 무의미)
      const baseForChange = matched.today > 0 ? matched.today : null;
      const weeklyChange =
        baseForChange != null && matched.week > 0
          ? ((baseForChange - matched.week) / matched.week) * 100
          : null;
      const monthlyChange =
        baseForChange != null && matched.month > 0
          ? ((baseForChange - matched.month) / matched.month) * 100
          : null;

      const weeklySuspicious = weeklyChange != null && Math.abs(weeklyChange) > 30;
      const monthlySuspicious = monthlyChange != null && Math.abs(monthlyChange) > 50;

      items.push({
        itemName: name,
        unit: matched.unit,
        current,
        previousWeek: matched.week > 0 ? matched.week : null,
        previousMonth: matched.month > 0 ? matched.month : null,
        weeklyChange: weeklyChange != null ? +weeklyChange.toFixed(1) : null,
        weeklyChangeAmount: weeklyChange != null ? baseForChange! - matched.week : null,
        weeklySuspicious,
        monthlyChange: monthlyChange != null ? +monthlyChange.toFixed(1) : null,
        monthlyChangeAmount: monthlyChange != null ? baseForChange! - matched.month : null,
        monthlySuspicious,
        lastUpdated: today,
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

  /** 시계열 포함 매칭 — 정확→부분 순 */
  private matchIngredientWithSeries(
    wanted: string,
    priceMap: Map<string, { price: number; unit: string; week: number; month: number }>,
  ): { price: number; unit: string; week: number; month: number } | null {
    const norm = wanted.replace(/\s+/g, "");
    if (priceMap.has(wanted)) return priceMap.get(wanted)!;
    if (priceMap.has(norm)) return priceMap.get(norm)!;
    for (const [key, val] of priceMap) {
      const keyNorm = key.replace(/\s+/g, "");
      if (keyNorm.includes(norm) || norm.includes(keyNorm)) return val;
    }
    return null;
  }

  /**
   * 변동률 기반 알림 생성 — KAMIS 응답의 시계열 직접 활용.
   */
  private async generateAlerts(
    stores: Array<{ id: string; keyIngredients: string[] }>,
    today: Date,
  ): Promise<number> {
    const todayStr = today.toISOString().slice(0, 10);

    // 카테고리별 데이터 한번에 캐시
    const categoryCache = new Map<
      string,
      Array<{ itemName: string; unit: string; today: number; week: number; month: number }>
    >();

    let count = 0;
    for (const store of stores) {
      for (const name of store.keyIngredients) {
        const catCode = findCategoryCode(name);
        if (!catCode) continue;

        if (!categoryCache.has(catCode)) {
          try {
            const list = await this.kamis.getMultiPointPrices(catCode, todayStr);
            categoryCache.set(catCode, list);
          } catch {
            categoryCache.set(catCode, []);
          }
        }

        const list = categoryCache.get(catCode)!;
        const norm = name.replace(/\s+/g, "");
        let matched = list.find((it) => it.itemName.replace(/\s+/g, "") === norm);
        if (!matched) {
          matched = list.find((it) => {
            const itn = it.itemName.replace(/\s+/g, "");
            return itn.includes(norm) || norm.includes(itn);
          });
        }
        if (!matched || matched.today <= 0) continue;

        const weeklyRate =
          matched.week > 0 ? ((matched.today - matched.week) / matched.week) * 100 : null;
        const monthlyRate =
          matched.month > 0 ? ((matched.today - matched.month) / matched.month) * 100 : null;

        // 중복 알림 방지 — 오늘 같은 타입 알림 있으면 skip
        const already = await this.prisma.ingredientAlert.findFirst({
          where: { storeId: store.id, itemName: name, createdAt: { gte: today } },
        });
        if (already) continue;

        // 이상치 제외 — KAMIS 측정 변경으로 인한 허위 급등 방지
        //   전주 +30% 초과 / 전월 +50% 초과는 실제 가격 변동이 아닐 가능성 높음
        const rules: Array<{ condition: boolean; type: string; rate: number; prev: number }> = [
          {
            condition: (monthlyRate ?? 0) >= 20 && (monthlyRate ?? 0) <= 50,
            type: "MONTHLY_20",
            rate: monthlyRate ?? 0,
            prev: matched.month,
          },
          {
            condition: (weeklyRate ?? 0) >= 10 && (weeklyRate ?? 0) <= 30,
            type: "WEEKLY_10",
            rate: weeklyRate ?? 0,
            prev: matched.week,
          },
        ];
        const hit = rules.find((r) => r.condition);
        if (!hit) continue;

        const diff = matched.today - hit.prev;
        const message =
          hit.type === "MONTHLY_20"
            ? `${name} 전월 대비 +${hit.rate.toFixed(1)}% (+${diff.toLocaleString()}원/${matched.unit}) 상승 — 세트 메뉴 가격 점검 권장`
            : `${name} 전주 대비 +${hit.rate.toFixed(1)}% (+${diff.toLocaleString()}원/${matched.unit}) 상승`;
        await this.prisma.ingredientAlert.create({
          data: {
            storeId: store.id,
            itemName: name,
            alertType: hit.type,
            message,
            currentPrice: matched.today,
            previousPrice: hit.prev,
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
    // 한국어 1글자 식재료 (쌀/콩/무/파/배 등) 허용 — 최소 1자
    const cleaned = [...new Set(ingredients.map((s) => s.trim()).filter((s) => s.length >= 1 && s.length <= 15))];
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
    // 한국어 1글자 식재료(쌀·콩·무·파·소·돼지의 단글자형) 가 다수 — 최소 1자 허용
    if (trimmed.length < 1 || trimmed.length > 15) throw new Error("재료명은 1~15자");
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
