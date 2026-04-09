import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { NaverDatalabProvider } from "../../providers/naver/naver-datalab.provider";
import { AIProvider } from "../../providers/ai/ai.provider";

/**
 * 검색 트래픽 이동 분석 (기획서 4.3).
 *
 * 시나리오:
 *  - 키워드 X 검색량이 지난 주 대비 -20% 감소
 *  - 동일 카테고리 후보 키워드 Y, Z 의 검색량 +30% 증가
 *  - AI 가 "X → Y 로 트래픽 이동, 이유는 Z" 형식으로 해석
 *
 * 데이터 소스:
 *  - KeywordVolumeHistory 테이블 (자체 누적, 검색광고 API 기반)
 *  - NaverDatalab API (상대적 비율 — 절대값 검증용 보조)
 *  - 검색광고 API getRelatedKeywords (후보 발굴)
 *
 * 정책:
 *  - 누적 데이터 1주 미만이면 분석 불가 메시지 명시 (껍데기 분석 금지)
 *  - 후보 자동 추출 → 검색광고 검증 → AI 해석
 */
@Injectable()
export class TrafficShiftService {
  private readonly logger = new Logger(TrafficShiftService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
    private datalab: NaverDatalabProvider,
    private ai: AIProvider,
  ) {}

  /**
   * 검색량 히스토리 기록 (DataCollector 가 매일 호출).
   * 매장의 모든 키워드에 대해 현재 월 검색량을 KeywordVolumeHistory 에 append.
   */
  async recordCurrentVolumes(storeId: string): Promise<number> {
    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
    });
    if (keywords.length === 0) return 0;

    let recorded = 0;
    for (const kw of keywords) {
      try {
        const stats = await this.searchad.getKeywordStats([
          kw.keyword.replace(/\s+/g, ""),
        ]);
        if (stats.length === 0) continue;
        const match =
          stats.find((s) => s.relKeyword === kw.keyword.replace(/\s+/g, "")) ||
          stats[0];
        const pc = Number(match.monthlyPcQcCnt) || 0;
        const mobile = Number(match.monthlyMobileQcCnt) || 0;
        const total = pc + mobile;
        if (total <= 0) continue;
        await this.prisma.keywordVolumeHistory.create({
          data: {
            storeId,
            keyword: kw.keyword,
            monthlyVolume: total,
            pcVolume: pc,
            mobileVolume: mobile,
            source: "searchad",
          },
        });
        recorded++;
        await new Promise((r) => setTimeout(r, 300));
      } catch (e: any) {
        this.logger.warn(
          `검색량 기록 실패 [${kw.keyword}]: ${e.message}`,
        );
      }
    }
    this.logger.log(`[${storeId}] 검색량 히스토리 ${recorded}건 기록`);
    return recorded;
  }

  /**
   * 트래픽 이동 분석.
   *
   * @param storeId 매장 ID
   * @param dropThreshold 감소 임계 % (기본 -15)
   * @returns 이동 분석 결과 배열 — 각 항목은 source 키워드 + 후보 + AI 해석
   */
  async analyzeShifts(
    storeId: string,
    dropThreshold = -15,
  ): Promise<Array<{
    sourceKeyword: string;
    sourceDropRate: number;
    sourcePrevious: number;
    sourceCurrent: number;
    candidates: Array<{
      keyword: string;
      gainRate: number;
      currentVolume: number;
    }>;
    interpretation: string | null;
    aiProvider: string | null;
  }>> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { keywords: true },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    // 1) 각 키워드의 최근 2시점 검색량 비교
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const drops: Array<{
      keyword: string;
      previous: number;
      current: number;
      dropRate: number;
    }> = [];

    for (const kw of store.keywords) {
      const history = await this.prisma.keywordVolumeHistory.findMany({
        where: {
          storeId,
          keyword: kw.keyword,
          recordedAt: { gte: fourteenDaysAgo },
        },
        orderBy: { recordedAt: "asc" },
      });
      if (history.length < 2) continue;
      const recent = history[history.length - 1].monthlyVolume;
      const past = history[0].monthlyVolume;
      if (past <= 0) continue;
      const rate = ((recent - past) / past) * 100;
      if (rate <= dropThreshold) {
        drops.push({
          keyword: kw.keyword,
          previous: past,
          current: recent,
          dropRate: rate,
        });
      }
    }

    if (drops.length === 0) {
      this.logger.log(
        `[${store.name}] 감소 임계치 ${dropThreshold}% 이하 키워드 없음`,
      );
      return [];
    }

    // 2) 각 감소 키워드에 대해 후보 발굴 → AI 해석
    const results: any[] = [];
    for (const drop of drops) {
      // 2-1) 검색광고 API 로 연관 키워드 후보
      let related: any[] = [];
      try {
        related = await this.searchad.getRelatedKeywords(drop.keyword);
      } catch (e: any) {
        this.logger.warn(`연관 키워드 조회 실패 [${drop.keyword}]: ${e.message}`);
      }

      // 2-2) 후보 중 검색량이 큰 상위 5개 추출
      const topCandidates = related
        .map((r) => ({
          keyword: r.relKeyword,
          volume: (Number(r.monthlyPcQcCnt) || 0) + (Number(r.monthlyMobileQcCnt) || 0),
        }))
        .filter((r) => r.volume > 0 && r.keyword !== drop.keyword)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

      // 2-3) DataLab 으로 동일 기간 상대 변동 비교
      const candidatesWithGain: Array<{
        keyword: string;
        gainRate: number;
        currentVolume: number;
      }> = [];
      try {
        const start = new Date();
        start.setDate(start.getDate() - 28);
        const end = new Date();
        const startStr = this.fmtDate(start);
        const endStr = this.fmtDate(end);
        const trends = await this.datalab.getSearchTrend(
          [drop.keyword, ...topCandidates.map((c) => c.keyword)],
          startStr,
          endStr,
          "week",
        );
        for (const cand of topCandidates) {
          const series = trends.results?.find((r) => r.title === cand.keyword);
          if (!series || series.data.length < 2) continue;
          const first = series.data[0].ratio;
          const last = series.data[series.data.length - 1].ratio;
          if (first <= 0) continue;
          const gain = ((last - first) / first) * 100;
          if (gain > 5) {
            candidatesWithGain.push({
              keyword: cand.keyword,
              gainRate: Math.round(gain * 10) / 10,
              currentVolume: cand.volume,
            });
          }
        }
      } catch (e: any) {
        this.logger.warn(
          `DataLab 비교 실패 [${drop.keyword}]: ${e.message} — 검색광고 데이터로만 진행`,
        );
        // DataLab 실패 시 검색광고 후보를 그대로 (gainRate 미상)
        for (const c of topCandidates.slice(0, 3)) {
          candidatesWithGain.push({
            keyword: c.keyword,
            gainRate: NaN,
            currentVolume: c.volume,
          });
        }
      }

      // 2-4) AI 해석
      let interpretation: string | null = null;
      let aiProvider: string | null = null;
      if (candidatesWithGain.length > 0) {
        try {
          const aiResp = await this.ai.analyze(
            "너는 검색 트렌드 분석 전문가다. 키워드 검색량 변동 데이터를 보고 트래픽 이동의 원인을 짧게 해석한다.",
            JSON.stringify({
              source: drop,
              candidates: candidatesWithGain,
              storeContext: {
                category: store.category,
                district: store.district,
              },
              instruction:
                "원본 키워드의 검색량이 왜 줄었고, 어느 후보로 이동했을 가능성이 높은지 한국어 1~2문장으로 해석. JSON 형식: { interpretation: string }",
            }),
          );
          aiProvider = aiResp.provider;
          try {
            const m = aiResp.content.match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]);
              interpretation = parsed.interpretation || aiResp.content;
            } else {
              interpretation = aiResp.content;
            }
          } catch {
            interpretation = aiResp.content;
          }
        } catch (e: any) {
          this.logger.warn(
            `AI 트래픽 이동 해석 실패 [${drop.keyword}]: ${e.message}`,
          );
        }
      }

      results.push({
        sourceKeyword: drop.keyword,
        sourceDropRate: Math.round(drop.dropRate * 10) / 10,
        sourcePrevious: drop.previous,
        sourceCurrent: drop.current,
        candidates: candidatesWithGain,
        interpretation,
        aiProvider,
      });
    }

    return results;
  }

  private fmtDate(d: Date): string {
    return d.toISOString().split("T")[0];
  }
}
