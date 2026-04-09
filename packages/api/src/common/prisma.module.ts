import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";
import { CacheService } from "./cache.service";

/**
 * 전역 공용 인프라 — Prisma + Crypto + Redis Cache.
 * 이름은 PrismaModule 로 유지하지만 실제 책임은 CommonModule.
 */
@Global()
@Module({
  providers: [PrismaService, CryptoService, CacheService],
  exports: [PrismaService, CryptoService, CacheService],
})
export class PrismaModule {}
