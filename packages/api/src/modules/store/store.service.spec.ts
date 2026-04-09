import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { StoreService } from "./store.service";
import { PrismaService } from "../../common/prisma.service";
import { DataCollectorService } from "../../providers/data/data-collector.service";
import { CompetitorFinderService } from "../../providers/data/competitor-finder.service";
import { StoreSetupService } from "../../providers/data/store-setup.service";

const mockPrisma = {
  store: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockDataCollector = { collectInitialData: jest.fn() };
const mockCompetitorFinder = { findCompetitors: jest.fn() };
const mockStoreSetup = { autoSetup: jest.fn().mockResolvedValue(undefined) };

describe("StoreService", () => {
  let service: StoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DataCollectorService, useValue: mockDataCollector },
        { provide: CompetitorFinderService, useValue: mockCompetitorFinder },
        { provide: StoreSetupService, useValue: mockStoreSetup },
      ],
    }).compile();

    service = module.get<StoreService>(StoreService);
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("매장을 생성한다", async () => {
      const mockStore = { id: "store-1", name: "테스트 매장", userId: "user-1" };
      mockPrisma.store.create.mockResolvedValue(mockStore);

      const result = await service.create("user-1", {
        name: "테스트 매장",
        category: "음식점",
      });

      expect(result.name).toBe("테스트 매장");
      expect(mockPrisma.store.create).toHaveBeenCalled();
    });

    it("네이버 플레이스 URL에서 ID를 추출한다", async () => {
      mockPrisma.store.create.mockResolvedValue({ id: "store-1" });

      await service.create("user-1", {
        name: "테스트",
        naverPlaceUrl: "https://map.naver.com/v5/entry/place/1234567890",
      });

      expect(mockPrisma.store.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ naverPlaceId: "1234567890" }),
        }),
      );
    });
  });

  describe("findOne", () => {
    it("존재하지 않는 매장이면 NotFoundException", async () => {
      mockPrisma.store.findFirst.mockResolvedValue(null);

      await expect(service.findOne("invalid", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findAllByUser", () => {
    it("사용자의 매장 목록을 반환한다", async () => {
      mockPrisma.store.findMany.mockResolvedValue([
        { id: "1", name: "매장1" },
        { id: "2", name: "매장2" },
      ]);

      const result = await service.findAllByUser("user-1");
      expect(result).toHaveLength(2);
    });
  });
});
