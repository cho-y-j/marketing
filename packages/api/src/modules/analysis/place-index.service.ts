import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

/**
 * 자체 산출 플레이스 지수 (N1/N2/N3).
 *
 * ⚠️ 네이버 비공개 지수가 아닌 우리의 자체 산출 점수임 (정직 라벨).
 * adlog.kr 등이 reverse engineering 으로 추정한 지수와 다르며,
 * 우리는 데이터로부터 투명하게 계산한다.
 *
 * 정의:
 *  - N1 (관련성 점수): 매장명/카테고리/주소가 키워드와 얼마나 매칭되는가
 *      → 키워드 토큰 vs 매장 기본 정보 토큰 자카드 유사도
 *  - N2 (콘텐츠 점수): 리뷰/저장/콘텐츠 활동 풍부도
 *      → 리뷰수 + 저장수 + 키워드 다양성 정규화
 *  - N3 (랭킹 점수): 실제 노출 순위 평균
 *      → 1위=100, 50위=0 선형 보간
 *
 * 0~100 정규화. NULL 가능 (데이터 부족 시).
 */
@Injectable()
export class PlaceIndexService {
  private readonly logger = new Logger(PlaceIndexService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 매장의 N1/N2/N3 산출.
   * StoreAnalysis 의 최신 행을 업데이트한다.
   */
  async computeAndPersist(storeId: string): Promise<{
    n1: number | null;
    n2: number | null;
    n3: number | null;
  }> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        keywords: true,
        analyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
      },
    });
    if (!store) throw new Error(`store ${storeId} not found`);
    if (store.analyses.length === 0) {
      this.logger.warn(
        `[${store.name}] 분석 행이 없음 — N1/N2/N3 산출 불가`,
      );
      return { n1: null, n2: null, n3: null };
    }
    const latest = store.analyses[0];

    // N1 — 관련성: 키워드와 매장 기본 정보 토큰 유사도 평균
    const n1 = this.computeN1(store, store.keywords);

    // N2 — 콘텐츠 활동: 리뷰 + 저장 + 키워드 풍부도
    const n2 = this.computeN2(latest, store.keywords.length);

    // N3 — 랭킹: 키워드 평균 순위
    const n3 = this.computeN3(store.keywords);

    // StoreAnalysis 업데이트
    await this.prisma.storeAnalysis.update({
      where: { id: latest.id },
      data: { trafficScore: n1, engagementScore: n2, satisfactionScore: n3 },
    });

    this.logger.log(
      `[${store.name}] N1=${n1?.toFixed(1)} N2=${n2?.toFixed(1)} N3=${n3?.toFixed(1)}`,
    );
    return { n1, n2, n3 };
  }

  // ===== N1: 관련성 점수 =====
  private computeN1(store: any, keywords: any[]): number | null {
    if (keywords.length === 0) return null;
    const baseTokens = this.tokenize(
      [store.name, store.category, store.subCategory, store.district, store.address]
        .filter(Boolean)
        .join(" "),
    );
    if (baseTokens.size === 0) return null;

    let totalSim = 0;
    let counted = 0;
    for (const kw of keywords) {
      const kwTokens = this.tokenize(kw.keyword);
      if (kwTokens.size === 0) continue;
      const sim = this.jaccard(baseTokens, kwTokens);
      // 검색량 가중치 (검색량 큰 키워드의 관련성이 더 중요)
      const weight = Math.min(3, 1 + Math.log10((kw.monthlySearchVolume || 1) + 1) / 5);
      totalSim += sim * weight;
      counted += weight;
    }
    if (counted === 0) return null;
    // 0~1 → 0~100
    return Math.round(Math.min(100, (totalSim / counted) * 100) * 10) / 10;
  }

  // ===== N2: 콘텐츠 활동 점수 =====
  private computeN2(latest: any, keywordCount: number): number | null {
    const reviews = (latest.blogReviewCount ?? 0) + (latest.receiptReviewCount ?? 0);
    const saves = latest.saveCount ?? 0;
    if (reviews === 0 && saves === 0 && keywordCount === 0) return null;

    // 로그 스케일로 정규화 (수십~수천을 0~100 로 매핑)
    const reviewScore = Math.min(60, Math.log10(reviews + 1) * 25); // 최대 60
    const saveScore = Math.min(20, Math.log10(saves + 1) * 12); // 최대 20
    const kwScore = Math.min(20, keywordCount * 1.5); // 최대 20
    const score = reviewScore + saveScore + kwScore;
    return Math.round(score * 10) / 10;
  }

  // ===== N3: 랭킹 점수 =====
  private computeN3(keywords: any[]): number | null {
    const ranked = keywords.filter((k) => k.currentRank != null && k.currentRank > 0);
    if (ranked.length === 0) return null;
    const avgRank =
      ranked.reduce((s, k) => s + k.currentRank, 0) / ranked.length;
    // 1위 = 100, 50위 = 0 (선형 보간, 50위 초과는 0)
    if (avgRank >= 50) return 0;
    if (avgRank <= 1) return 100;
    const score = 100 - ((avgRank - 1) / 49) * 100;
    return Math.round(score * 10) / 10;
  }

  // ===== 유틸: 한글 토큰화 (간이) =====
  private tokenize(text: string): Set<string> {
    if (!text) return new Set();
    const cleaned = text
      .toLowerCase()
      .replace(/[^\w가-힣\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
    // 2-gram 보강 (한국어 부분 매칭 강화)
    const result = new Set<string>(tokens);
    for (const t of tokens) {
      if (t.length >= 4) {
        for (let i = 0; i <= t.length - 2; i++) {
          result.add(t.slice(i, i + 2));
        }
      }
    }
    return result;
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const t of b) if (a.has(t)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }
}
