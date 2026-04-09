import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import {
  CONTENT_PLACE_POST_PROMPT,
  CONTENT_REVIEW_REPLY_PROMPT,
  CONTENT_SNS_POST_PROMPT,
  CONTENT_BLOG_POST_PROMPT,
} from "../../providers/ai/prompts";
import { GenerateContentDto, UpdateContentDto } from "./dto/content.dto";
import { ContentType, ContentStatus } from "@prisma/client";

const CONTENT_PROMPTS: Record<string, string> = {
  PLACE_POST: CONTENT_PLACE_POST_PROMPT,
  REVIEW_REPLY: CONTENT_REVIEW_REPLY_PROMPT,
  SNS_POST: CONTENT_SNS_POST_PROMPT,
  BLOG_POST: CONTENT_BLOG_POST_PROMPT,
};

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
  ) {}

  async findAll(storeId: string) {
    return this.prisma.generatedContent.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  // AI 콘텐츠 생성
  async generate(storeId: string, dto: GenerateContentDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        keywords: { orderBy: { monthlySearchVolume: "desc" }, take: 5 },
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
      },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");

    this.logger.log(`콘텐츠 생성: ${store.name} (${dto.type})`);

    const systemPrompt = CONTENT_PROMPTS[dto.type] || CONTENT_PLACE_POST_PROMPT;

    // 시즌 정보
    const today = new Date();
    const seasonalEvents = await this.prisma.seasonalEvent.findMany({
      where: { startDate: { lte: today }, endDate: { gte: today } },
    });

    const latestAnalysis = store.analyses?.[0];
    const userPrompt = JSON.stringify({
      store: {
        name: store.name,
        category: store.category,
        subCategory: store.subCategory,
        district: store.district,
        address: store.address,
        competitiveScore: store.competitiveScore,
        receiptReviews: latestAnalysis?.receiptReviewCount ?? 0,
        blogReviews: latestAnalysis?.blogReviewCount ?? 0,
      },
      targetKeywords: dto.targetKeywords || store.keywords.map((kw) => kw.keyword),
      seasonalKeywords: seasonalEvents.flatMap((e) => e.keywords),
      instruction: dto.instruction || null,
    });

    // AI 콘텐츠 생성 (높은 temperature)
    const aiResponse = await this.ai.generate(systemPrompt, userPrompt);

    // JSON 파싱 — 실패 시 명시적 에러
    let parsed: any;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);
    } catch (e: any) {
      this.logger.error(
        `콘텐츠 JSON 파싱 실패 [${store.name}/${dto.type}] provider=${aiResponse.provider}: ${e.message}`,
      );
      this.logger.error(
        `AI 응답 원문 (앞 500자): ${aiResponse.content.slice(0, 500)}`,
      );
      throw new Error(
        `AI 콘텐츠 응답이 유효한 JSON이 아닙니다 (provider=${aiResponse.provider})`,
      );
    }
    if (!parsed.body || typeof parsed.body !== "string") {
      throw new Error(
        `AI 콘텐츠 응답에 body 필드가 없거나 비어있음 (provider=${aiResponse.provider})`,
      );
    }

    return this.prisma.generatedContent.create({
      data: {
        storeId,
        type: dto.type as ContentType,
        title: parsed.title || `${store.name} 콘텐츠`,
        body: parsed.body,
        keywords: parsed.targetKeywords || parsed.tags || [],
      },
    });
  }

  async update(storeId: string, contentId: string, dto: UpdateContentDto) {
    const content = await this.prisma.generatedContent.findFirst({
      where: { id: contentId, storeId },
    });
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");

    return this.prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        title: dto.title,
        body: dto.body,
        status: dto.status as ContentStatus,
      },
    });
  }

  async remove(storeId: string, contentId: string) {
    const content = await this.prisma.generatedContent.findFirst({
      where: { id: contentId, storeId },
    });
    if (!content) throw new NotFoundException("콘텐츠를 찾을 수 없습니다");
    return this.prisma.generatedContent.delete({ where: { id: contentId } });
  }
}
