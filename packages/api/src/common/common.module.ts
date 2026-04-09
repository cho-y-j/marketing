import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";
import { CacheService } from "./cache.service";

/**
 * 전역 공용 인프라 모듈.
 * Prisma, Crypto, Redis Cache 를 한 번에 노출한다.
 *
 * 기존 PrismaModule 은 호환성을 위해 유지되며 내부적으로 같은 PrismaService 를 export 한다.
 */
@Global()
@Module({
  providers: [PrismaService, CryptoService, CacheService],
  exports: [PrismaService, CryptoService, CacheService],
})
export class CommonModule {}
