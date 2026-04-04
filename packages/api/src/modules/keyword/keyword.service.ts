import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { CreateKeywordDto } from "./dto/keyword.dto";
import { KeywordType } from "@prisma/client";

@Injectable()
export class KeywordService {
  private readonly logger = new Logger(KeywordService.name);

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
  ) {}

  async findAll(storeId: string) {
    return this.prisma.storeKeyword.findMany({
      where: { storeId },
      orderBy: { monthlySearchVolume: "desc" },
    });
  }

  async getRecommended(storeId: string) {
    return this.prisma.storeKeyword.findMany({
      where: { storeId, type: "AI_RECOMMENDED" },
      orderBy: { monthlySearchVolume: "desc" },
    });
  }

  async getTrends(storeId: string) {
    return this.prisma.storeKeyword.findMany({
      where: { storeId, trendDirection: { not: null } },
      orderBy: { trendPercentage: "desc" },
    });
  }

  async create(storeId: string, dto: CreateKeywordDto) {
    const keyword = await this.prisma.storeKeyword.create({
      data: {
        storeId,
        keyword: dto.keyword,
        type: (dto.type as KeywordType) || "USER_ADDED",
      },
    });

    // 비동기로 검색량 조회 (응답 블로킹하지 않음)
    this.fetchSearchVolume(keyword.id, dto.keyword);

    return keyword;
  }

  // 키워드 검색량 자동 조회
  private async fetchSearchVolume(keywordId: string, keyword: string) {
    try {
      // 공백 제거 버전으로도 시도 (네이버 검색광고 API는 공백 없는 키워드 선호)
      const searchTerm = keyword.replace(/\s+/g, "");
      const stats = await this.searchad.getKeywordStats([searchTerm]);

      if (stats.length > 0) {
        // 정확 매칭 또는 첫 번째 결과 사용
        const match = stats.find(
          (s) => s.relKeyword === searchTerm || s.relKeyword === keyword,
        ) || stats[0];

        const volume = this.searchad.getTotalMonthlySearch(match);

        await this.prisma.storeKeyword.update({
          where: { id: keywordId },
          data: {
            monthlySearchVolume: volume,
            lastCheckedAt: new Date(),
          },
        });

        this.logger.log(`검색량 조회: "${keyword}" = ${volume.toLocaleString()}회/월`);
      }
    } catch (e: any) {
      this.logger.warn(`검색량 조회 실패 [${keyword}]: ${e.message}`);
    }
  }

  // 기존 키워드들의 검색량 일괄 업데이트
  async refreshAllSearchVolumes(storeId: string) {
    const keywords = await this.prisma.storeKeyword.findMany({
      where: { storeId },
    });

    for (const kw of keywords) {
      await this.fetchSearchVolume(kw.id, kw.keyword);
      await new Promise((r) => setTimeout(r, 500)); // Rate limit
    }

    return { updated: keywords.length };
  }
}
