import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import {
  TourapiProvider,
  TourapiNotConfiguredError,
  TourapiFestival,
} from "./tourapi.provider";

/**
 * 시즌 이벤트(축제) 자동 수집기.
 * 기획서 4.5: "공공데이터 활용하여 지역 축제 자동 감지"
 *
 * 동작:
 *  1) 매일 새벽 (또는 매장 셋업 시) 호출
 *  2) 매장 주소에서 광역(시도) 추출 → areaCode 변환
 *  3) 향후 60일 축제 조회 → SeasonalEvent 테이블 upsert
 *  4) 축제명/지역에서 키워드 자동 추출 (예: "벚꽃축제" → ["벚꽃", "벚꽃 맛집", "벚꽃 데이트"])
 *
 * 정책:
 *  - TOURAPI_KEY 미설정 시 NotConfiguredError 그대로 던짐 (껍데기 동작 금지)
 *  - 캐싱은 TourapiProvider 가 자체 처리
 */
@Injectable()
export class EventCollectorService {
  private readonly logger = new Logger(EventCollectorService.name);

  constructor(
    private prisma: PrismaService,
    private tourapi: TourapiProvider,
  ) {}

  /**
   * 매장 단위 축제 수집.
   * @returns upsert 된 이벤트 개수
   */
  async collectForStore(storeId: string, daysAhead = 60): Promise<number> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, address: true, district: true },
    });
    if (!store) throw new Error(`store ${storeId} not found`);

    if (!this.tourapi.isConfigured()) {
      throw new TourapiNotConfiguredError();
    }

    // 1) 주소에서 법정동 시도/시군구 코드 추출
    const fullAddr = store.address || store.district || "";
    const region = this.extractRegion(fullAddr);
    const ldong = await this.tourapi.resolveLdongCodes(fullAddr);
    this.logger.log(
      `[${store.name}] 지역=${ldong.regnName}/${ldong.signguName} lDong=${ldong.regn}/${ldong.signgu}`,
    );

    // 2) 날짜 범위
    const today = new Date();
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    const startDate = this.fmt(today);
    const endDate = this.fmt(future);

    // 3) 3단 폴백 체인으로 축제 수집
    //    - 1순위: 시군구 (예: 단양군) — 가장 정확
    //    - 2순위: 시도 (예: 충북) — 근방 전체
    //    - 3순위: 전국 — 관광지 대형 축제
    const all: TourapiFestival[] = [];
    const fetchPaged = async (params: {
      lDongRegnCd?: string;
      lDongSignguCd?: string;
    }) => {
      const collected: TourapiFestival[] = [];
      for (let page = 1; page <= 3; page++) {
        const list = await this.tourapi.searchFestivals({
          startDate, endDate, numOfRows: 50, pageNo: page, ...params,
        });
        if (list.length === 0) break;
        collected.push(...list);
        if (list.length < 50) break;
      }
      return collected;
    };

    let tier: "sigungu" | "sido" | "nation" = "nation";
    if (ldong.regn && ldong.signgu) {
      const list = await fetchPaged({ lDongRegnCd: ldong.regn, lDongSignguCd: ldong.signgu });
      if (list.length > 0) {
        all.push(...list);
        tier = "sigungu";
      }
    }
    if (all.length === 0 && ldong.regn) {
      const list = await fetchPaged({ lDongRegnCd: ldong.regn });
      if (list.length > 0) {
        all.push(...list);
        tier = "sido";
      }
    }
    if (all.length === 0) {
      // 전국 축제 (마지막 폴백) — 대형 행사나 전국 관광 대상
      all.push(...(await fetchPaged({})));
      tier = "nation";
    }
    this.logger.log(`[${store.name}] 축제 ${all.length}건 수집됨 (${tier} 매칭)`);

    // 4) DB upsert — contentid 를 자연 키로 사용 (SeasonalEvent 에 unique 가 없으므로 name+startDate 매칭)
    let count = 0;
    for (const f of all) {
      const startD = this.parseYmd(f.eventstartdate);
      const endD = this.parseYmd(f.eventenddate || f.eventstartdate);
      if (!startD || !endD) continue;

      const keywords = this.extractKeywords(f.title, f.addr1);

      // 같은 이름+같은 시작일 이면 update, 아니면 create
      const existing = await this.prisma.seasonalEvent.findFirst({
        where: { name: f.title, startDate: startD },
      });
      if (existing) {
        await this.prisma.seasonalEvent.update({
          where: { id: existing.id },
          data: {
            endDate: endD,
            region: this.extractRegion(f.addr1) ?? region ?? null,
            keywords,
            description: f.addr1 || null,
          },
        });
      } else {
        await this.prisma.seasonalEvent.create({
          data: {
            name: f.title,
            startDate: startD,
            endDate: endD,
            region: this.extractRegion(f.addr1) ?? region ?? null,
            keywords,
            description: f.addr1 || null,
          },
        });
      }
      count++;
    }
    this.logger.log(`[${store.name}] 축제 ${count}건 DB 반영`);
    return count;
  }

  /**
   * 매장 region 컬럼에 부합하는 현재 진행 중인 축제 조회.
   */
  async getActiveEventsForStore(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { address: true, district: true },
    });
    if (!store) return [];
    const region = this.extractRegion(store.address || store.district || "");
    const today = new Date();

    // "충북" → "충청북도" 매핑 (짧은 표기 → 정식명)
    const shortToFull: Record<string, string> = {
      충북: "충청북도", 충남: "충청남도", 전북: "전라북도", 전남: "전라남도",
      경북: "경상북도", 경남: "경상남도", 경기: "경기도", 강원: "강원",
      서울: "서울", 부산: "부산", 대구: "대구", 인천: "인천",
      광주: "광주", 대전: "대전", 울산: "울산", 세종: "세종", 제주: "제주",
    };
    const regionVariants = region
      ? [region, shortToFull[region], ...(shortToFull[region] ? [shortToFull[region]] : [])].filter(Boolean)
      : [];

    return this.prisma.seasonalEvent.findMany({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
        ...(regionVariants.length > 0
          ? { OR: [
              ...regionVariants.map((r) => ({ region: { contains: r as string } })),
              { region: null },
            ] }
          : {}),
      },
      orderBy: { startDate: "asc" },
      take: 10,
    });
  }

  // ===== 유틸 =====

  /** YYYYMMDD → Date */
  private parseYmd(s: string): Date | null {
    if (!s || s.length !== 8) return null;
    const y = parseInt(s.slice(0, 4));
    const m = parseInt(s.slice(4, 6));
    const d = parseInt(s.slice(6, 8));
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  /** Date → YYYYMMDD */
  private fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  /**
   * 주소 문자열에서 광역 시/도 명 추출.
   * 예: "충청북도 청주시 흥덕구 가경동..." → "충청북도"
   */
  private extractRegion(addr: string): string | null {
    if (!addr) return null;
    const a = addr.trim();
    // 광역 시/도 패턴
    const patterns = [
      /^(서울특별시)/,
      /^(부산광역시)/,
      /^(대구광역시)/,
      /^(인천광역시)/,
      /^(광주광역시)/,
      /^(대전광역시)/,
      /^(울산광역시)/,
      /^(세종특별자치시)/,
      /^(경기도)/,
      /^(강원특별자치도|강원도)/,
      /^(충청북도)/,
      /^(충청남도)/,
      /^(전라북도|전북특별자치도)/,
      /^(전라남도)/,
      /^(경상북도)/,
      /^(경상남도)/,
      /^(제주특별자치도|제주도)/,
      // 짧은 표기
      /^(서울)/,
      /^(부산)/,
      /^(대구)/,
      /^(인천)/,
      /^(광주)/,
      /^(대전)/,
      /^(울산)/,
      /^(세종)/,
      /^(경기)/,
      /^(강원)/,
      /^(충북)/,
      /^(충남)/,
      /^(전북)/,
      /^(전남)/,
      /^(경북)/,
      /^(경남)/,
      /^(제주)/,
    ];
    for (const p of patterns) {
      const m = a.match(p);
      if (m) return m[1];
    }
    return null;
  }

  /**
   * 축제명에서 키워드 후보 추출.
   * 예: "영랑호 벚꽃축제" → ["벚꽃", "벚꽃축제", "벚꽃 데이트", "영랑호 벚꽃"]
   */
  private extractKeywords(title: string, addr: string): string[] {
    const keywords = new Set<string>();
    if (!title) return [];

    // 핵심 명사 1~2개 추출 (간단 규칙)
    const cleaned = title.replace(/제\s*$/, "").replace(/[()【】\[\]]/g, " ");
    const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
    for (const t of tokens) keywords.add(t);
    keywords.add(title);

    // 흔한 시즌 단어 매핑
    const seasonal: Record<string, string[]> = {
      벚꽃: ["벚꽃 맛집", "벚꽃 데이트", "벚꽃축제"],
      봄꽃: ["봄꽃 명소", "봄나들이"],
      국화: ["국화축제", "가을 데이트"],
      불꽃: ["불꽃축제", "불꽃놀이 명소"],
      해돋이: ["해맞이", "새해 맛집"],
      단풍: ["단풍 명소", "가을 단풍"],
      야경: ["야경 명소", "야경 데이트"],
      별빛: ["별빛 명소", "별빛 데이트"],
      먹거리: ["먹거리 축제", "지역 맛집"],
    };
    for (const [k, exts] of Object.entries(seasonal)) {
      if (title.includes(k)) for (const e of exts) keywords.add(e);
    }

    return Array.from(keywords).slice(0, 12);
  }
}
