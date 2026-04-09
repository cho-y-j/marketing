import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { CONTENT_REVIEW_REPLY_PROMPT } from "../../providers/ai/prompts";

/**
 * 매장 리뷰 수집 + AI 답글 자동 작성 (검수 대기 상태로).
 *
 * 흐름:
 *  1) fetchReviews(storeId)  → 네이버 맵 API로 최근 리뷰 수집 (Chrome 불필요)
 *     → StoreReview 테이블에 새 리뷰만 upsert (externalId 중복 방지)
 *  2) draftReplies(storeId)  → replyStatus=PENDING 리뷰 각각에 AI 답글 생성
 *     → DRAFTED 상태로 저장 (자동 게시 X — 사장 검수 필수)
 *  3) approveReply / rejectReply / publishReply  → 사장 결정
 *
 * 자동 게시는 위험(브랜드 평판/네이버 ToS) → 검수 단계 필수.
 * 향후 신뢰도 충분 시 PUBLISHED 자동 전환 옵션 추가 가능.
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AIProvider,
    private naverPlace: NaverPlaceProvider,
  ) {}

  /**
   * 네이버 맵 API로 최근 리뷰 수집 (Chrome 불필요).
   * @returns 새로 추가된 리뷰 개수
   */
  async fetchReviews(storeId: string, max = 20): Promise<number> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, naverPlaceId: true },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");
    if (!store.naverPlaceId) {
      throw new BadRequestException(
        `${store.name}: naverPlaceId 가 설정되지 않아 리뷰 수집 불가`,
      );
    }

    let added = 0;
    const totalPages = Math.ceil(max / 20);

    for (let page = 1; page <= totalPages; page++) {
      const reviewData = await this.naverPlace.getPlaceReviews(store.naverPlaceId, page);
      if (reviewData.reviews.length === 0) break;

      for (const review of reviewData.reviews) {
        if (!review.content || review.content.length < 5) continue;
        if (added >= max) break;

        const externalId = `api:${store.naverPlaceId}:${review.date || ""}:${review.content.slice(0, 40)}`;

        try {
          await this.prisma.storeReview.create({
            data: {
              storeId: store.id,
              source: "naver",
              externalId,
              authorName: review.author || "익명",
              rating: review.rating ?? null,
              body: review.content,
              postedAt: review.date ? new Date(review.date) : new Date(),
              replyStatus: "PENDING",
            },
          });
          added++;
        } catch (e: any) {
          if (!/Unique constraint/i.test(e.message)) {
            this.logger.warn(`리뷰 저장 실패: ${e.message}`);
          }
        }
      }
    }

    this.logger.log(`[${store.name}] 리뷰 수집: ${added}건 추가`);
    return added;
  }

  /**
   * PENDING 리뷰에 대해 AI 답글 초안 생성.
   * @returns 초안 작성 건수
   */
  async draftReplies(storeId: string): Promise<number> {
    const pending = await this.prisma.storeReview.findMany({
      where: { storeId, replyStatus: "PENDING" },
      orderBy: { postedAt: "desc" },
      take: 20,
    });
    if (pending.length === 0) return 0;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, category: true },
    });

    let drafted = 0;
    for (const review of pending) {
      try {
        const userPrompt = JSON.stringify({
          store: {
            name: store?.name,
            category: store?.category,
          },
          review: {
            author: review.authorName,
            rating: review.rating,
            body: review.body,
          },
          instruction: "JSON 형식으로 응답: { title, body, tags, targetKeywords }",
        });
        const aiResp = await this.ai.generate(
          CONTENT_REVIEW_REPLY_PROMPT,
          userPrompt,
        );
        let parsed: any;
        try {
          const m = aiResp.content.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(m ? m[0] : aiResp.content);
        } catch {
          this.logger.warn(
            `리뷰 답글 JSON 파싱 실패 review=${review.id} → 원본 텍스트 사용`,
          );
          parsed = { body: aiResp.content };
        }
        if (!parsed.body || typeof parsed.body !== "string") {
          throw new Error("AI 답글에 body 가 없음");
        }
        await this.prisma.storeReview.update({
          where: { id: review.id },
          data: {
            replyStatus: "DRAFTED",
            draftReply: parsed.body,
            draftedAt: new Date(),
          },
        });
        drafted++;
        await new Promise((r) => setTimeout(r, 500));
      } catch (e: any) {
        this.logger.warn(`리뷰 ${review.id} 답글 생성 실패: ${e.message}`);
      }
    }
    this.logger.log(`[${store?.name}] AI 답글 초안 ${drafted}건 작성`);
    return drafted;
  }

  /** 검수 대기 목록 (DRAFTED) */
  async getPendingReviews(storeId: string) {
    return this.prisma.storeReview.findMany({
      where: { storeId, replyStatus: "DRAFTED" },
      orderBy: { draftedAt: "desc" },
    });
  }

  async getAllReviews(storeId: string) {
    return this.prisma.storeReview.findMany({
      where: { storeId },
      orderBy: { postedAt: "desc" },
      take: 100,
    });
  }

  /** 답글 승인 — finalReply 가 비어있으면 draftReply 사용 */
  async approveReply(storeId: string, reviewId: string, finalReply?: string) {
    const review = await this.prisma.storeReview.findFirst({
      where: { id: reviewId, storeId },
    });
    if (!review) throw new NotFoundException("리뷰를 찾을 수 없습니다");
    return this.prisma.storeReview.update({
      where: { id: reviewId },
      data: {
        replyStatus: "APPROVED",
        finalReply: finalReply ?? review.draftReply,
        approvedAt: new Date(),
      },
    });
  }

  async rejectReply(storeId: string, reviewId: string) {
    const review = await this.prisma.storeReview.findFirst({
      where: { id: reviewId, storeId },
    });
    if (!review) throw new NotFoundException("리뷰를 찾을 수 없습니다");
    return this.prisma.storeReview.update({
      where: { id: reviewId },
      data: { replyStatus: "REJECTED" },
    });
  }
}
