import { PlaceIndexService } from "./place-index.service";

/**
 * PlaceIndexService N1/N2/N3 산출식 단위 테스트.
 * Prisma 모킹 없이 private 메소드를 노출하여 순수 계산 로직 검증.
 */
describe("PlaceIndexService", () => {
  let svc: any;
  beforeEach(() => {
    svc = new PlaceIndexService(null as any);
  });

  describe("N1 (관련성)", () => {
    it("매장명/카테고리와 키워드가 일치하면 점수 상승", () => {
      const store = {
        name: "남해꼼장어",
        category: "꼼장어",
        district: "가경동",
        address: "충북 청주시 흥덕구 가경동",
      };
      const keywords = [
        { keyword: "가경동 꼼장어", monthlySearchVolume: 1000 },
        { keyword: "청주 꼼장어 맛집", monthlySearchVolume: 5000 },
      ];
      const score = svc.computeN1(store, keywords);
      expect(score).not.toBeNull();
      expect(score).toBeGreaterThan(10);
    });

    it("관련 없는 키워드는 낮은 점수", () => {
      const store = { name: "남해꼼장어", category: "꼼장어", district: "청주", address: "" };
      const keywords = [
        { keyword: "서울 강남 카페", monthlySearchVolume: 10000 },
      ];
      const score = svc.computeN1(store, keywords);
      expect(score).toBeLessThan(20);
    });

    it("키워드 0개면 null", () => {
      expect(svc.computeN1({ name: "x" }, [])).toBeNull();
    });
  });

  describe("N2 (콘텐츠 활동)", () => {
    it("리뷰/저장/키워드가 풍부하면 높은 점수", () => {
      const score = svc.computeN2(
        { blogReviewCount: 1000, receiptReviewCount: 2000, saveCount: 500 },
        15,
      );
      expect(score).toBeGreaterThan(60);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("데이터가 부족하면 낮은 점수", () => {
      const score = svc.computeN2(
        { blogReviewCount: 5, receiptReviewCount: 10, saveCount: 1 },
        2,
      );
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(40);
    });

    it("모두 0이면 null", () => {
      expect(
        svc.computeN2({ blogReviewCount: 0, receiptReviewCount: 0, saveCount: 0 }, 0),
      ).toBeNull();
    });
  });

  describe("N3 (랭킹)", () => {
    it("1위 평균이면 100점", () => {
      const score = svc.computeN3([
        { currentRank: 1 },
        { currentRank: 1 },
      ]);
      expect(score).toBe(100);
    });

    it("50위 이상이면 0점", () => {
      const score = svc.computeN3([{ currentRank: 50 }]);
      expect(score).toBe(0);
    });

    it("선형 보간 — 25위는 약 51점", () => {
      const score = svc.computeN3([{ currentRank: 25 }]);
      expect(score).toBeGreaterThan(45);
      expect(score).toBeLessThan(60);
    });

    it("순위 미체크 키워드는 제외", () => {
      const score = svc.computeN3([
        { currentRank: 1 },
        { currentRank: null },
        { currentRank: 0 },
      ]);
      expect(score).toBe(100);
    });

    it("모든 키워드가 미체크면 null", () => {
      expect(svc.computeN3([{ currentRank: null }])).toBeNull();
      expect(svc.computeN3([])).toBeNull();
    });
  });

  describe("tokenize/jaccard 유틸", () => {
    it("한글 토큰화 + 2-gram 보강", () => {
      const tokens = svc.tokenize("청주꼼장어 가경동맛집");
      // 4글자 이상 단어는 2-gram 보강
      expect(tokens.has("청주꼼장어")).toBe(true);
      expect(tokens.size).toBeGreaterThan(3);
    });

    it("jaccard 유사도 계산", () => {
      const a = new Set(["a", "b", "c"]);
      const b = new Set(["b", "c", "d"]);
      // |교집합| = 2, |합집합| = 4 → 0.5
      expect(svc.jaccard(a, b)).toBe(0.5);
    });

    it("빈 집합은 0", () => {
      expect(svc.jaccard(new Set(), new Set(["a"]))).toBe(0);
    });
  });
});
