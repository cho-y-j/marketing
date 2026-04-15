import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";

/**
 * 브랜드 검색량 합산 서비스.
 *
 * 의뢰자 지시: 매장명 단일이 아닌 변형들(브랜드+지역, 브랜드+역)을 합산해야
 * 진짜 브랜드 검색 유입량이 집계됨.
 *
 * 예시 — 매장명 "찬란한아구 공덕직영점", 지역 힌트 "공덕":
 *   찬란한아구 / 찬란한아구 공덕 / 찬란한아구공덕 / 찬란한아구 공덕역 / 찬란한아구공덕역
 *   → 각 볼륨 합산
 */
@Injectable()
export class BrandVolumeService {
  private readonly logger = new Logger(BrandVolumeService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
  ) {}

  async getBrandVolume(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, district: true, address: true },
    });
    if (!store) return null;

    const variations = this.generateVariations(store.name, store.district, store.address);
    if (variations.length === 0) return { variations: [], totalMonthly: 0, totalDaily: 0 };

    const cleaned = variations.map((v) => v.replace(/\s+/g, "").replace(/,/g, ""));
    let stats: any[] = [];
    try {
      stats = await this.searchad.getKeywordStats(cleaned);
    } catch (e: any) {
      this.logger.warn(`브랜드 볼륨 조회 실패: ${e.message}`);
      return { variations: [], totalMonthly: 0, totalDaily: 0 };
    }

    const rows: Array<{ keyword: string; monthly: number }> = [];
    let total = 0;
    for (const v of variations) {
      const clean = v.replace(/\s+/g, "").replace(/,/g, "");
      const s = stats.find((x) => x.relKeyword === clean);
      if (!s) continue;
      const monthly = this.searchad.getTotalMonthlySearch(s);
      if (monthly > 0) {
        rows.push({ keyword: v, monthly });
        total += monthly;
      }
    }

    return {
      variations: rows.sort((a, b) => b.monthly - a.monthly),
      totalMonthly: total,
      totalDaily: Math.round(total / 30),
    };
  }

  private generateVariations(storeName: string, district: string | null, address: string | null): string[] {
    // 매장명 정리 — 지점/직영점 접미사 제거한 브랜드 베이스
    const base = storeName
      .replace(/(직영점|역점|지점|본점|점)$/, "")
      .replace(/([가-힣]{2,4}?)(직영점|역점|지점|점)$/, "$1")
      .trim();
    const brandCore = base.split(/\s+/)[0] ?? base; // "찬란한아구 공덕" → "찬란한아구"

    // 지역 힌트 — 매장명 브랜드 힌트 우선, 그 다음 동/구
    const brandLocationHint = storeName.match(/([가-힣]{2,4}?)(직영점|역점|지점|점)/)?.[1];
    const all = `${district ?? ""} ${address ?? ""}`;
    const dong = all.match(/([가-힣]{2,}?)동/)?.[1];
    const gu = all.match(/([가-힣]{2,}?)구/)?.[1];

    const locations = Array.from(new Set([
      brandLocationHint,
      dong,
      gu,
    ].filter((x): x is string => !!x && x.length >= 2)));

    const variations = new Set<string>();
    variations.add(brandCore);
    variations.add(storeName);
    variations.add(base);
    for (const loc of locations) {
      variations.add(`${brandCore} ${loc}`);
      variations.add(`${brandCore}${loc}`);
      variations.add(`${brandCore} ${loc}역`);
      variations.add(`${brandCore}${loc}역`);
      variations.add(`${brandCore} ${loc}점`);
    }

    return Array.from(variations).filter((v) => v.length >= 2 && v.length <= 25);
  }
}
