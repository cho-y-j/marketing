import { ConfigService } from "@nestjs/config";
import { CryptoService } from "./crypto.service";

/**
 * CryptoService 단위 테스트.
 * 실제 AES-256-GCM 암호화/복호화 동작 검증.
 */

const TEST_KEY = "a".repeat(64); // hex 64자

function makeService(key = TEST_KEY): CryptoService {
  const config = {
    get: (k: string) => (k === "ENCRYPTION_KEY" ? key : undefined),
  } as unknown as ConfigService;
  return new CryptoService(config);
}

describe("CryptoService", () => {
  it("ENCRYPTION_KEY 미설정 시 인스턴스 생성 실패", () => {
    expect(() => makeService("")).toThrow(/ENCRYPTION_KEY/);
  });

  it("encrypt → decrypt 라운드트립", () => {
    const svc = makeService();
    const plain = "sk-ant-api03-abcdefghij1234567890";
    const enc = svc.encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(enc.length).toBeGreaterThan(20);
    expect(svc.decrypt(enc)).toBe(plain);
  });

  it("동일 평문이라도 매번 다른 ciphertext 생성 (IV 랜덤)", () => {
    const svc = makeService();
    const a = svc.encrypt("hello");
    const b = svc.encrypt("hello");
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe("hello");
    expect(svc.decrypt(b)).toBe("hello");
  });

  it("hex 가 아닌 키도 scrypt 로 유도하여 동작", () => {
    const svc = makeService("not-hex-passphrase-1234567890");
    const enc = svc.encrypt("test");
    expect(svc.decrypt(enc)).toBe("test");
  });

  it("손상된 페이로드 복호화 실패", () => {
    const svc = makeService();
    expect(() => svc.decrypt("invalid-base64-too-short")).toThrow();
  });

  it("빈 문자열 처리", () => {
    const svc = makeService();
    expect(svc.encrypt("")).toBe("");
    expect(svc.decrypt("")).toBe("");
  });

  it("mask 로 민감 데이터 마스킹", () => {
    const svc = makeService();
    expect(svc.mask("sk-ant-api03-abc123def456")).toMatch(/^sk-ant-a\.\.\..{4}$/);
    expect(svc.mask("short")).toBe("*****");
    expect(svc.mask("")).toBe("");
  });
});
