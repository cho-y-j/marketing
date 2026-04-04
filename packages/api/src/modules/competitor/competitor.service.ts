import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { NaverSearchadProvider } from "../../providers/naver/naver-searchad.provider";
import { CreateCompetitorDto } from "./dto/competitor.dto";
import { chromium } from "playwright-core";
import { execFileSync } from "child_process";

@Injectable()
export class CompetitorService {
  private readonly logger = new Logger(CompetitorService.name);
  private readonly chromePath: string;

  constructor(
    private prisma: PrismaService,
    private searchad: NaverSearchadProvider,
  ) {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
    ];
    let found = "";
    for (const p of paths) {
      try { execFileSync("test", ["-f", p]); found = p; break; } catch {}
    }
    this.chromePath = found;
  }

  async findAll(storeId: string) {
    return this.prisma.competitor.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(storeId: string, dto: CreateCompetitorDto) {
    const competitor = await this.prisma.competitor.create({
      data: {
        storeId,
        competitorName: dto.competitorName,
        competitorPlaceId: dto.competitorPlaceId,
        competitorUrl: dto.competitorUrl,
        category: dto.category,
        type: "USER_SET",
      },
    });

    // 비동기로 경쟁매장 데이터 수집
    this.collectCompetitorData(competitor.id, dto.competitorName).catch((e) =>
      this.logger.warn(`경쟁매장 데이터 수집 실패 [${dto.competitorName}]: ${e.message}`),
    );

    return competitor;
  }

  async remove(storeId: string, competitorId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id: competitorId, storeId },
    });
    if (!competitor) throw new NotFoundException("경쟁 매장을 찾을 수 없습니다");
    return this.prisma.competitor.delete({ where: { id: competitorId } });
  }

  // 경쟁 비교 분석 데이터
  async getComparison(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: { take: 5, orderBy: { monthlySearchVolume: "desc" } },
      },
    });
    const competitors = await this.prisma.competitor.findMany({
      where: { storeId },
    });

    // 비교 데이터 구성
    const myAnalysis = store?.analyses?.[0];
    return {
      store: {
        name: store?.name,
        address: store?.address,
        category: store?.category,
        competitiveScore: store?.competitiveScore,
        blogReviewCount: myAnalysis?.blogReviewCount ?? 0,
        receiptReviewCount: myAnalysis?.receiptReviewCount ?? 0,
        dailySearchVolume: myAnalysis?.dailySearchVolume ?? 0,
        saveCount: myAnalysis?.saveCount ?? 0,
      },
      competitors: competitors.map((c) => ({
        id: c.id,
        name: c.competitorName,
        type: c.type,
        blogReviewCount: c.blogReviewCount ?? 0,
        receiptReviewCount: c.receiptReviewCount ?? 0,
        dailySearchVolume: c.dailySearchVolume ?? 0,
      })),
      keywords: store?.keywords?.map((k) => ({
        keyword: k.keyword,
        volume: k.monthlySearchVolume,
        rank: k.currentRank,
      })),
    };
  }

  // 경쟁매장 전체 데이터 새로고침
  async refreshAll(storeId: string) {
    const competitors = await this.prisma.competitor.findMany({ where: { storeId } });
    let updated = 0;
    for (const c of competitors) {
      try {
        await this.collectCompetitorData(c.id, c.competitorName);
        updated++;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { updated, total: competitors.length };
  }

  // 네이버 검색에서 경쟁매장 실데이터 수집
  private async collectCompetitorData(competitorId: string, name: string) {
    if (!this.chromePath) return;

    this.logger.log(`경쟁매장 데이터 수집: ${name}`);

    try {
      const browser = await chromium.launch({
        headless: true,
        executablePath: this.chromePath,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();
      await page.goto(
        `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`,
        { waitUntil: "networkidle", timeout: 15000 },
      );
      const html = await page.content();
      await browser.close();

      // 리뷰 수 추출 (여러 패턴 시도)
      const reviewPatterns = [
        /"reviewCount":(\d+)/,
        /"totalReviewCount":(\d+)/,
        /"visitorReviewCount":(\d+)/,
        /리뷰\s*(\d[\d,]*)/,
        /방문자리뷰\s*(\d[\d,]*)/,
      ];
      const blogPatterns = [
        /"blogReviewCount":(\d+)/,
        /블로그리뷰\s*(\d[\d,]*)/,
        /블로그\s*(\d[\d,]*)/,
      ];

      let receiptReviewCount = 0;
      for (const p of reviewPatterns) {
        const m = html.match(p);
        if (m) { receiptReviewCount = parseInt(m[1].replace(/,/g, "")); break; }
      }

      let blogReviewCount = 0;
      for (const p of blogPatterns) {
        const m = html.match(p);
        if (m) { blogReviewCount = parseInt(m[1].replace(/,/g, "")); break; }
      }

      // 검색량도 조회
      let searchVolume = 0;
      try {
        const stats = await this.searchad.getKeywordStats([name.replace(/\s+/g, "")]);
        if (stats.length > 0) {
          searchVolume = Math.round(this.searchad.getTotalMonthlySearch(stats[0]) / 30);
        }
      } catch {}

      await this.prisma.competitor.update({
        where: { id: competitorId },
        data: {
          receiptReviewCount: receiptReviewCount || undefined,
          blogReviewCount: blogReviewCount || undefined,
          dailySearchVolume: searchVolume || undefined,
          lastComparedAt: new Date(),
        },
      });

      this.logger.log(`경쟁매장 데이터 수집 완료: ${name} (리뷰:${receiptReviewCount}, 블로그:${blogReviewCount})`);
    } catch (e: any) {
      this.logger.warn(`경쟁매장 스크래핑 실패 [${name}]: ${e.message}`);
    }
  }
}
