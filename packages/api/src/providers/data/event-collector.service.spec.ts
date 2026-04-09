import { EventCollectorService } from "./event-collector.service";

/**
 * EventCollectorService 유틸 단위 테스트.
 * 외부 의존 없는 순수 계산 메소드만 검증.
 */
describe("EventCollectorService utils", () => {
  let svc: any;

  beforeEach(() => {
    svc = new EventCollectorService(null as any, null as any);
  });

  describe("parseYmd", () => {
    it("YYYYMMDD 파싱", () => {
      const d = svc.parseYmd("20260411");
      expect(d).toBeInstanceOf(Date);
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(3); // 0-indexed
      expect(d.getUTCDate()).toBe(11);
    });

    it("잘못된 길이는 null", () => {
      expect(svc.parseYmd("2026")).toBeNull();
      expect(svc.parseYmd("")).toBeNull();
      expect(svc.parseYmd(null)).toBeNull();
    });
  });

  describe("fmt (Date → YYYYMMDD)", () => {
    it("로컬 날짜 변환", () => {
      const d = new Date(2026, 3, 11); // 2026-04-11 local
      expect(svc.fmt(d)).toBe("20260411");
    });
  });

  describe("extractRegion", () => {
    it("긴 광역명 매칭", () => {
      expect(svc.extractRegion("충청북도 청주시 흥덕구 가경동 1378")).toBe("충청북도");
      expect(svc.extractRegion("서울특별시 강남구")).toBe("서울특별시");
    });

    it("짧은 표기 매칭", () => {
      expect(svc.extractRegion("서울 강남구")).toBe("서울");
      expect(svc.extractRegion("충북 청주시")).toBe("충북");
    });

    it("매칭 없으면 null", () => {
      expect(svc.extractRegion("123 unknown")).toBeNull();
      expect(svc.extractRegion("")).toBeNull();
    });
  });

  describe("extractKeywords", () => {
    it("축제명에서 토큰 추출", () => {
      const kws = svc.extractKeywords("영랑호 벚꽃축제", "강원특별자치도 속초시");
      expect(kws.length).toBeGreaterThan(0);
      expect(kws).toContain("영랑호 벚꽃축제");
      // 시즌 매핑
      expect(kws).toContain("벚꽃 맛집");
    });

    it("최대 12개 제한", () => {
      const kws = svc.extractKeywords(
        "벚꽃 봄꽃 단풍 야경 별빛 불꽃 해돋이 국화 먹거리 축제",
        "",
      );
      expect(kws.length).toBeLessThanOrEqual(12);
    });
  });
});
