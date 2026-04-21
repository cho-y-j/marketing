import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AIProvider } from "../../providers/ai/ai.provider";
import { NaverPlaceProvider } from "../../providers/naver/naver-place.provider";
import { NotificationService } from "../notification/notification.service";
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
    private notifications: NotificationService,
  ) {}

  /**
   * 네이버 맵 API로 최근 리뷰 수집 (Chrome 불필요).
   * @returns 새로 추가된 리뷰 개수
   */
  async fetchReviews(storeId: string, max = 20): Promise<number> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, naverPlaceId: true, userId: true },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");
    if (!store.naverPlaceId) {
      throw new BadRequestException(
        `${store.name}: naverPlaceId 가 설정되지 않아 리뷰 수집 불가`,
      );
    }

    // 사장님 네이버 토큰이 있으면 사용 (IP 차단 회피)
    const user = await this.prisma.user.findUnique({
      where: { id: store.userId },
      select: { naverAccessToken: true },
    });
    const naverToken = user?.naverAccessToken || undefined;

    let added = 0;
    const totalPages = Math.ceil(max / 20);

    for (let page = 1; page <= totalPages; page++) {
      const reviewData = await this.naverPlace.getPlaceReviews(store.naverPlaceId, page, naverToken);
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
              postedAt: this.parseKoreanDate(review.date),
              fetchedAt: new Date(),
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

    // 신규 리뷰 알림
    if (added > 0) {
      this.notifications
        .create(store.userId, {
          type: "NEW_REVIEW",
          title: `새 리뷰 ${added}건 수집`,
          message: `${store.name}에 새 리뷰 ${added}건이 수집되었습니다. AI 답글을 생성해보세요.`,
        })
        .catch((e) => this.logger.warn(`리뷰 알림 생성 실패: ${e.message}`));
    }

    return added;
  }

  // 네이버 한국어 날짜 파싱: "4.4.토", "3.27.금", "2025.12.25." 등
  private parseKoreanDate(dateStr?: string): Date {
    if (!dateStr) return new Date();

    // "2026.04.10." or "2026.4.10" 형식
    const fullMatch = dateStr.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (fullMatch) {
      return new Date(+fullMatch[1], +fullMatch[2] - 1, +fullMatch[3]);
    }

    // "4.4.토" or "3.27.금" or "12.25.수" 형식 (올해 기준)
    const shortMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\.?/);
    if (shortMatch) {
      const year = new Date().getFullYear();
      const month = +shortMatch[1];
      const day = +shortMatch[2];
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const d = new Date(year, month - 1, day);
        // 미래 날짜면 작년으로
        if (d > new Date()) d.setFullYear(year - 1);
        return d;
      }
    }

    // ISO 형식 or 기타
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;

    return new Date();
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

    // 일괄 처리: 모든 리뷰를 한 번에 AI에 보내서 답글 생성 (1건씩 → 일괄)
    const reviewList = pending.map((r, i) => ({
      index: i + 1,
      author: r.authorName || "방문자",
      rating: r.rating,
      body: r.body?.slice(0, 200),
    }));

    const userPrompt = JSON.stringify({
      store: { name: store?.name, category: store?.category },
      reviews: reviewList,
      instruction: `위 ${reviewList.length}건의 리뷰 각각에 대한 사장님 답글을 작성해주세요.
JSON 배열로 응답: [{ "index": 1, "reply": "답글 내용" }, { "index": 2, "reply": "..." }, ...]
- 각 답글은 2~3문장, 친절하고 자연스럽게
- 매장명(${store?.name})을 자연스럽게 포함
- 이모지 적절히 사용`,
    });

    let drafted = 0;

    try {
      const aiResp = await this.ai.generate(
        CONTENT_REVIEW_REPLY_PROMPT,
        userPrompt,
      );

      let replies: any[] = [];
      try {
        const m = aiResp.content.match(/\[[\s\S]*\]/);
        replies = JSON.parse(m ? m[0] : aiResp.content);
      } catch {
        this.logger.warn("일괄 답글 JSON 파싱 실패 → 개별 처리 폴백");
      }

      // 일괄 결과가 있으면 매핑
      if (Array.isArray(replies) && replies.length > 0) {
        for (const review of pending) {
          const idx = pending.indexOf(review) + 1;
          const match = replies.find((r: any) => r.index === idx);
          const replyText = match?.reply || match?.body;
          if (replyText && typeof replyText === "string" && this.isValidReply(replyText)) {
            await this.prisma.storeReview.update({
              where: { id: review.id },
              data: {
                replyStatus: "DRAFTED",
                draftReply: replyText,
                draftedAt: new Date(),
              },
            });
            drafted++;
          }
        }
      }

      // 일괄 실패한 리뷰는 개별 처리
      if (drafted < pending.length) {
        const remaining = pending.filter(
          (r) => !replies?.find((_: any, i: number) => i + 1 <= drafted && pending[i]?.id === r.id),
        );
        for (const review of remaining) {
          if (drafted >= pending.length) break;
          const alreadyDrafted = await this.prisma.storeReview.findUnique({
            where: { id: review.id },
            select: { replyStatus: true },
          });
          if (alreadyDrafted?.replyStatus === "DRAFTED") continue;

          try {
            const singlePrompt = JSON.stringify({
              store: { name: store?.name, category: store?.category },
              review: { author: review.authorName, body: review.body?.slice(0, 200) },
              instruction: "이 리뷰에 대한 사장님 답글을 2~3문장으로 작성. JSON: { \"reply\": \"답글\" }",
            });
            const resp = await this.ai.generate(CONTENT_REVIEW_REPLY_PROMPT, singlePrompt);
            const m = resp.content.match(/\{[\s\S]*\}/);
            let text = "";
            try {
              const parsed = JSON.parse(m ? m[0] : `{"reply":${JSON.stringify(resp.content)}}`);
              text = parsed.reply || parsed.body || "";
            } catch {
              text = resp.content;
            }
            if (!this.isValidReply(text)) {
              this.logger.warn(`리뷰 ${review.id} 답글 검증 실패 — 저장 안 함`);
              continue;
            }
            await this.prisma.storeReview.update({
              where: { id: review.id },
              data: { replyStatus: "DRAFTED", draftReply: text, draftedAt: new Date() },
            });
            drafted++;
          } catch (e: any) {
            this.logger.warn(`리뷰 ${review.id} 개별 답글 생성 실패: ${e.message}`);
          }
        }
      }
    } catch (e: any) {
      this.logger.error(`일괄 답글 생성 실패: ${e.message}`);
    }

    this.logger.log(`[${store?.name}] AI 답글 초안 ${drafted}건 작성`);
    return drafted;
  }

  /**
   * 답글 검증 — AI 오류로 저장된 JSON 덤프 / 에러 메시지 차단.
   * 올바른 답글은 한국어 문장 5자 이상, JSON/키워드 포함 X.
   */
  private isValidReply(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (trimmed.length < 5 || trimmed.length > 500) return false;
    // 분석/브리핑 JSON 필드 포함되면 거부
    if (/competitiveScore|_meta|strengths|weaknesses|recommendations|ai_unavailable/i.test(trimmed)) return false;
    // JSON 형태 (중괄호 시작) 거부
    if (/^\s*[\{\[]/.test(trimmed)) return false;
    return true;
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
