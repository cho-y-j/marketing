import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { CreateStoreDto, UpdateStoreDto } from "./dto/store.dto";
import { StoreSetupService } from "../../providers/data/store-setup.service";

// 네이버 플레이스 URL에서 ID 추출
function extractPlaceIdFromUrl(url: string): string | null {
  const patterns = [/place\/(\d+)/, /restaurant\/(\d+)/, /cafe\/(\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    private prisma: PrismaService,
    private storeSetup: StoreSetupService,
  ) {}

  async create(userId: string, dto: CreateStoreDto) {
    const naverPlaceId = dto.naverPlaceUrl
      ? extractPlaceIdFromUrl(dto.naverPlaceUrl)
      : null;

    const store = await this.prisma.store.create({
      data: {
        userId,
        name: dto.name,
        naverPlaceUrl: dto.naverPlaceUrl,
        naverPlaceId: naverPlaceId,
        category: dto.category,
        subCategory: dto.subCategory,
        address: dto.address,
        district: dto.district,
      },
    });

    // 비동기 자동 셋업 — 실패해도 store는 반환, 상태는 DB에 기록됨
    // customKeywords/customCompetitorNames 는 AI 자동 생성보다 우선 저장됨
    this.storeSetup
      .autoSetup(store.id, {
        customKeywords: dto.customKeywords,
        customCompetitorNames: dto.customCompetitorNames,
      })
      .catch((e) => {
        this.logger.warn(`자동 셋업 실패 [${store.name}]: ${e.message}`);
        // setupStatus=FAILED 는 autoSetup 내부에서 이미 기록됨
      });

    return store;
  }

  async findAllByUser(userId: string) {
    return this.prisma.store.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, userId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, userId },
      include: {
        analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
        keywords: { take: 5 },
        competitors: { take: 3 },
      },
    });
    if (!store) throw new NotFoundException("매장을 찾을 수 없습니다");
    return store;
  }

  async update(id: string, userId: string, dto: UpdateStoreDto) {
    await this.findOne(id, userId);
    return this.prisma.store.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * 매장 삭제 — 관계 테이블 일괄 정리.
   *
   * onDelete: Cascade 가 걸린 모델은 자동 삭제됨:
   *   FranchiseMembership, StoreAnalysis, Competitor, StoreKeyword,
   *   DailyBriefing, GeneratedContent, KeywordRankHistory
   *
   * @relation 없이 storeId 만 가진 모델은 수동 deleteMany (orphan 방지):
   *   PendingAction, ActionLog, CompetitorAlert, KeywordVolumeHistory,
   *   StoreReview, BlogAnalysis, StoreDailySnapshot, CompetitorDailySnapshot,
   *   ExcludedKeyword, IngredientAlert, StoreAutoSettings, ConsultationRequest,
   *   CompetitorHistory(via Competitor cascade), CompetitorDailySnapshot
   */
  async remove(id: string, userId: string) {
    await this.findOne(id, userId); // 권한 검증 (본인 매장만 삭제)

    // 트랜잭션: orphan 수동 삭제 → Store 삭제 (cascade 는 자동)
    await this.prisma.$transaction(async (tx) => {
      // @relation 없는 storeId-only 모델들 명시 삭제
      await tx.pendingAction.deleteMany({ where: { storeId: id } });
      await tx.actionLog.deleteMany({ where: { storeId: id } });
      await tx.competitorAlert.deleteMany({ where: { storeId: id } });
      await tx.keywordVolumeHistory.deleteMany({ where: { storeId: id } });
      await tx.storeReview.deleteMany({ where: { storeId: id } });
      await tx.blogAnalysis.deleteMany({ where: { storeId: id } });
      await tx.storeDailySnapshot.deleteMany({ where: { storeId: id } });
      await tx.competitorDailySnapshot.deleteMany({ where: { storeId: id } });
      await tx.excludedKeyword.deleteMany({ where: { storeId: id } });
      await tx.ingredientAlert.deleteMany({ where: { storeId: id } });
      await tx.storeAutoSettings.deleteMany({ where: { storeId: id } });
      await tx.consultationRequest.deleteMany({ where: { storeId: id } });

      // Store 삭제 — @relation 7개는 onDelete: Cascade 로 자동 정리
      await tx.store.delete({ where: { id } });
    });

    this.logger.log(`매장 삭제 완료: ${id} (유저 ${userId})`);
    return { ok: true, id };
  }

}
