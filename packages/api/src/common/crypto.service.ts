import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

/**
 * AES-256-GCM 양방향 암호화.
 * 사용자 API 키, 토큰 등 민감 데이터 저장에 사용.
 *
 * 환경변수 ENCRYPTION_KEY: 32바이트 hex (64자).
 *  - 미설정 시 기동을 막아 평문 저장 사고를 원천 차단한다.
 *
 * 저장 포맷: base64(iv(12) || authTag(16) || ciphertext)
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;
  private static readonly ALGO = "aes-256-gcm";
  private static readonly IV_LEN = 12;
  private static readonly TAG_LEN = 16;

  constructor(private config: ConfigService) {
    const raw = this.config.get<string>("ENCRYPTION_KEY") || "";
    if (!raw) {
      throw new InternalServerErrorException(
        "ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. " +
          "민감 데이터 평문 저장 방지를 위해 기동을 중단합니다.",
      );
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      this.key = Buffer.from(raw, "hex");
    } else {
      // hex 가 아니면 scrypt 로 32바이트 유도 (운영 환경 안전망)
      this.logger.warn(
        "ENCRYPTION_KEY 가 hex(64자) 형식이 아니어서 scrypt KDF로 유도합니다.",
      );
      this.key = scryptSync(raw, "marketing-intelligence-salt", 32);
    }
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return "";
    const iv = randomBytes(CryptoService.IV_LEN);
    const cipher = createCipheriv(CryptoService.ALGO, this.key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }

  decrypt(payload: string): string {
    if (!payload) return "";
    const buf = Buffer.from(payload, "base64");
    if (buf.length < CryptoService.IV_LEN + CryptoService.TAG_LEN) {
      throw new InternalServerErrorException("암호화 페이로드가 손상되었습니다");
    }
    const iv = buf.subarray(0, CryptoService.IV_LEN);
    const tag = buf.subarray(
      CryptoService.IV_LEN,
      CryptoService.IV_LEN + CryptoService.TAG_LEN,
    );
    const enc = buf.subarray(CryptoService.IV_LEN + CryptoService.TAG_LEN);
    const decipher = createDecipheriv(CryptoService.ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  }

  /** 마스킹된 표시용 문자열 (sk-ant-***...***xyz) */
  mask(plaintext: string): string {
    if (!plaintext) return "";
    if (plaintext.length <= 12) return "*".repeat(plaintext.length);
    return `${plaintext.slice(0, 8)}...${plaintext.slice(-4)}`;
  }
}
