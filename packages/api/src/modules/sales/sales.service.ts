import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";

/**
 * 매장 매출 입력·조회·AI 인사이트.
 *
 * 사장님 룰 (정공법):
 *  - 자동화는 인스타·POS·여신금융협회 모두 비현실적 (보안·법무·인프라 비용)
 *  - 영수증 사진 OCR (Vision API + Claude AI 후처리) + 숫자 직접 입력 폴백
 *  - 진짜 가치 = "광고 시작 후 매출 +N%" AI 매칭 인사이트 (캐시노트가 못 하는 영역)
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private ai: AIProvider,
  ) {}

  /**
   * 매출 직접 입력 (또는 OCR 후 사장님 확인 후 저장).
   * 같은 날짜 row 가 있으면 update — 사장님이 정정 가능.
   */
  async upsertSales(
    storeId: string,
    input: {
      date: Date;
      totalAmount: number;
      cardAmount?: number | null;
      cashAmount?: number | null;
      source?: "MANUAL" | "OCR";
      note?: string | null;
      receiptText?: string | null;
    },
  ) {
    if (input.totalAmount < 0 || input.totalAmount > 100_000_000) {
      throw new BadRequestException("매출은 0 ~ 1억 사이");
    }
    const date = new Date(input.date);
    date.setUTCHours(0, 0, 0, 0);
    return this.prisma.sales.upsert({
      where: { storeId_date: { storeId, date } },
      update: {
        totalAmount: input.totalAmount,
        cardAmount: input.cardAmount ?? null,
        cashAmount: input.cashAmount ?? null,
        source: input.source ?? "MANUAL",
        note: input.note ?? null,
        receiptText: input.receiptText ?? null,
      },
      create: {
        storeId,
        date,
        totalAmount: input.totalAmount,
        cardAmount: input.cardAmount ?? null,
        cashAmount: input.cashAmount ?? null,
        source: input.source ?? "MANUAL",
        note: input.note ?? null,
        receiptText: input.receiptText ?? null,
      },
    });
  }

  /**
   * 영수증 사진 (base64) → Google Vision API → 정규식 파싱.
   * 한국 POS 영수증은 표준 라벨 (총매출/TOTAL/합계 + 카드 + 현금) 따르므로
   * Claude 후처리 없이 정규식만으로 90%+ 커버. 비용 0, 의존성 0.
   * 정규식 실패 시 totalAmount=null 반환 → 프런트가 사장님 직접 입력 폴백.
   */
  async parseReceiptImage(imageBase64: string): Promise<{
    totalAmount: number | null;
    cardAmount: number | null;
    cashAmount: number | null;
    rawText: string;
    confidence: "high" | "low";
  }> {
    const apiKey = this.config.get<string>("GOOGLE_VISION_KEY");
    if (!apiKey) {
      throw new BadRequestException(
        "GOOGLE_VISION_KEY 환경변수가 없습니다 — Vision API 키 설정 필요",
      );
    }

    // Vision API 호출 — DOCUMENT_TEXT_DETECTION (영수증/문서에 더 정확)
    const axios = (await import("axios")).default;
    let rawText = "";
    try {
      const resp = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
              imageContext: { languageHints: ["ko", "en"] },
            },
          ],
        },
        { timeout: 30000 },
      );
      rawText =
        resp.data?.responses?.[0]?.fullTextAnnotation?.text ||
        resp.data?.responses?.[0]?.textAnnotations?.[0]?.description ||
        "";
    } catch (e: any) {
      this.logger.error(`Vision API 호출 실패: ${e.message}`);
      throw new BadRequestException(
        `영수증 인식 실패: ${e.response?.data?.error?.message || e.message}`,
      );
    }

    if (!rawText.trim()) {
      throw new BadRequestException("영수증에서 텍스트를 읽을 수 없습니다 — 더 밝은 곳에서 다시 촬영해주세요");
    }

    const parsed = this.extractAmountsFromText(rawText);
    this.logger.log(
      `[영수증 파싱] total=${parsed.totalAmount} card=${parsed.cardAmount} cash=${parsed.cashAmount} conf=${parsed.confidence}`,
    );
    return { ...parsed, rawText };
  }

  /**
   * 영수증 텍스트에서 총매출/카드/현금 금액 추출 (정규식).
   * 한국 POS 영수증 표준 라벨 (포스뱅크/OKPOS/다인포스/카드 단말기 NICE/KIS) 모두 대응.
   * 합계와 카드/현금이 일치하면 confidence=high.
   */
  private extractAmountsFromText(text: string): {
    totalAmount: number | null;
    cardAmount: number | null;
    cashAmount: number | null;
    confidence: "high" | "low";
  } {
    // 텍스트 정규화 — 줄바꿈 유지, 공백 1개로 압축
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const fullText = lines.join("\n");

    const parseNum = (s: string): number | null => {
      if (!s) return null;
      const cleaned = s.replace(/[,\s원\\]/g, "");
      const n = parseInt(cleaned, 10);
      return Number.isFinite(n) && n > 0 && n < 1_000_000_000 ? n : null;
    };

    // 라벨 옆 첫 숫자 매칭 — 같은 줄 또는 다음 한 줄.
    const findAmount = (patterns: RegExp[]): number | null => {
      for (const p of patterns) {
        // 같은 줄
        const m1 = fullText.match(p);
        if (m1) {
          const n = parseNum(m1[1] || "");
          if (n != null) return n;
        }
      }
      return null;
    };

    // 총매출 — POS 회사별 라벨
    const total = findAmount([
      /(?:총\s*매출\s*액?|매출\s*합계|총\s*합계|순\s*매출|TOTAL\s*SALES?|TOTAL)\s*[:|=]?\s*([0-9,]+)/i,
      /(?:합계|총액|당일\s*매출)\s*[:|=]?\s*([0-9,]+)/,
      // "1,250,000 원" 단독으로 가장 큰 숫자가 있을 때 폴백 — 보수적이라 미사용
    ]);

    const card = findAmount([
      /(?:신용\s*카드|카드\s*매출|카드\s*합계|TOTAL\s*CARD|CARD\s*SALES?)\s*[:|=]?\s*([0-9,]+)/i,
      /(?:^|\n)\s*카드\s*[:|=]?\s*([0-9,]+)/m,
    ]);

    const cash = findAmount([
      /(?:현금\s*매출|현금\s*합계|TOTAL\s*CASH|CASH\s*SALES?)\s*[:|=]?\s*([0-9,]+)/i,
      /(?:^|\n)\s*현금\s*[:|=]?\s*([0-9,]+)/m,
    ]);

    // confidence — total 있고 (card+cash == total ± 1%) 면 high
    let confidence: "high" | "low" = "low";
    if (total != null) {
      if (card != null && cash != null) {
        const sum = card + cash;
        const diff = Math.abs(sum - total) / Math.max(total, 1);
        confidence = diff < 0.01 ? "high" : "low";
      } else {
        // total 만이라도 명확히 나왔으면 medium 정도 — high 로 봐줌
        confidence = "high";
      }
    }

    return {
      totalAmount: total,
      cardAmount: card,
      cashAmount: cash,
      confidence,
    };
  }

  /**
   * 매출 조회 — 일/주/월 단위 집계.
   * @param period day(최근 30일 일별) | week(최근 12주) | month(최근 12개월)
   */
  async getSales(storeId: string, period: "day" | "week" | "month") {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    let since: Date;
    if (period === "day") {
      since = new Date(now);
      since.setUTCDate(since.getUTCDate() - 29); // 최근 30일
    } else if (period === "week") {
      since = new Date(now);
      since.setUTCDate(since.getUTCDate() - 7 * 11); // 최근 12주
    } else {
      since = new Date(now);
      since.setUTCMonth(since.getUTCMonth() - 11); // 최근 12개월
    }

    const rows = await this.prisma.sales.findMany({
      where: { storeId, date: { gte: since } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        totalAmount: true,
        cardAmount: true,
        cashAmount: true,
        source: true,
        note: true,
      },
    });

    // 집계 — period 별 버킷
    if (period === "day") {
      // 일별 그대로 (빈 날짜는 0)
      const byDay = new Map<string, { total: number; card: number; cash: number; note: string | null }>();
      for (const r of rows) {
        const key = r.date.toISOString().slice(0, 10);
        byDay.set(key, {
          total: r.totalAmount,
          card: r.cardAmount ?? 0,
          cash: r.cashAmount ?? 0,
          note: r.note,
        });
      }
      const result: Array<{ label: string; total: number; card: number; cash: number; note: string | null }> = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const key = d.toISOString().slice(0, 10);
        const v = byDay.get(key);
        result.push({
          label: key,
          total: v?.total ?? 0,
          card: v?.card ?? 0,
          cash: v?.cash ?? 0,
          note: v?.note ?? null,
        });
      }
      return { period, points: result };
    }

    // 주별 / 월별 — 버킷별 합산
    const buckets = new Map<string, { total: number; card: number; cash: number }>();
    const bucketKey = (d: Date): string => {
      if (period === "week") {
        // 월요일 기준 주 시작
        const dt = new Date(d);
        const dow = (dt.getUTCDay() + 6) % 7; // 월요일=0
        dt.setUTCDate(dt.getUTCDate() - dow);
        return dt.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 7); // YYYY-MM
    };
    for (const r of rows) {
      const k = bucketKey(r.date);
      const cur = buckets.get(k) ?? { total: 0, card: 0, cash: 0 };
      cur.total += r.totalAmount;
      cur.card += r.cardAmount ?? 0;
      cur.cash += r.cashAmount ?? 0;
      buckets.set(k, cur);
    }

    // 빈 버킷 채움
    const result: Array<{ label: string; total: number; card: number; cash: number }> = [];
    const numBuckets = period === "week" ? 12 : 12;
    for (let i = numBuckets - 1; i >= 0; i--) {
      const d = new Date(now);
      if (period === "week") d.setUTCDate(d.getUTCDate() - 7 * i);
      else d.setUTCMonth(d.getUTCMonth() - i);
      const k = bucketKey(d);
      const v = buckets.get(k) ?? { total: 0, card: 0, cash: 0 };
      result.push({ label: k, ...v });
    }
    return { period, points: result };
  }

  /**
   * 매출 변화와 마케팅 활동 매칭 — Claude AI 인사이트.
   * "4/22 '청주 꼼장어' 광고 시작 후 매출 +18%" 같은 자동 진단.
   *
   * 주간 성과 1번 호출 — 캐시 1시간 권장 (별도 캐싱 X, frontend staleTime 5분).
   */
  async getMarketingROI(storeId: string): Promise<{
    insight: string;
    weeklyChange: { current: number; previous: number; deltaPct: number | null } | null;
    triggers: Array<{ date: string; type: string; label: string }>;
  } | null> {
    // 최근 4주 매출
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 28);
    const rows = await this.prisma.sales.findMany({
      where: { storeId, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { date: true, totalAmount: true, note: true },
    });

    if (rows.length < 7) return null; // 1주일치 없으면 인사이트 X

    const thisWeek = rows.slice(-7).reduce((s, r) => s + r.totalAmount, 0);
    const lastWeek = rows.slice(-14, -7).reduce((s, r) => s + r.totalAmount, 0);
    const deltaPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10 : null;

    // 트리거 — 최근 28일 사이 마케팅 활동 마커
    // 1) StoreKeyword.createdAt (키워드 추가) → 광고 시작 시점
    // 2) GeneratedContent.createdAt → 콘텐츠 생성
    // 3) Sales.note (사장님이 직접 마커 입력)
    const [keywords, contents] = await Promise.all([
      this.prisma.storeKeyword.findMany({
        where: { storeId, createdAt: { gte: since } },
        select: { keyword: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.prisma.generatedContent.findMany({
        where: { storeId, createdAt: { gte: since } },
        select: { type: true, title: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    const triggers = [
      ...keywords.map((k) => ({
        date: k.createdAt.toISOString().slice(0, 10),
        type: "keyword",
        label: `'${k.keyword}' 키워드 추가`,
      })),
      ...contents.map((c) => ({
        date: c.createdAt.toISOString().slice(0, 10),
        type: "content",
        label: `${c.type} "${c.title?.slice(0, 20) || ""}" 생성`,
      })),
      ...rows.filter((r) => r.note).map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        type: "note",
        label: r.note!,
      })),
    ];

    // Claude AI 인사이트 — 매출 변화 + 마케팅 활동 매칭
    let insight = `이번 주 매출 ${this.formatWon(thisWeek)} (지난주 ${this.formatWon(lastWeek)}, ${deltaPct != null ? (deltaPct > 0 ? "+" : "") + deltaPct + "%" : "-"})`;
    try {
      const systemPrompt = `너는 자영업 매장 마케팅 분석가. 매장 매출 변화와 마케팅 활동을 매칭해 사장님이 한 줄로 이해할 수 있는 인사이트를 만든다.
원칙:
- 사실 기반 — 트리거가 매출 변화 시점 직전에 있으면 인과 가능성 표시 ("~이후 매출 +N%")
- 명확한 인과 추정만, 추측 금지
- 1~2문장. 액션도 1개 추천 (예: "같은 키워드로 블로그 글 1개 더 추천")
- 한국어`;
      const userPrompt = JSON.stringify({
        thisWeek,
        lastWeek,
        deltaPct,
        triggers,
        recentSales: rows.slice(-14).map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          amount: r.totalAmount,
        })),
      });
      const ai = await this.ai.analyze(systemPrompt, userPrompt);
      insight = ai.content.trim().slice(0, 300);
    } catch (e: any) {
      this.logger.warn(`매출 인사이트 AI 실패: ${e.message}`);
    }

    return {
      insight,
      weeklyChange: { current: thisWeek, previous: lastWeek, deltaPct },
      triggers: triggers.slice(0, 8),
    };
  }

  private formatWon(n: number): string {
    if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
    return `${n.toLocaleString()}원`;
  }
}
