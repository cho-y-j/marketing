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

    // 비동기 자동 셋업 (플레이스 정보 수집 → AI 키워드 → 경쟁매장 → 검색량)
    this.storeSetup.autoSetup(store.id).catch((e) => {
      this.logger.warn(`자동 셋업 실패: ${e.message}`);
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

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.store.delete({ where: { id } });
  }

  async getActiveStores() {
    return this.prisma.store.findMany({
      where: { user: { subscriptionPlan: { not: "FREE" } } },
    });
  }
}
