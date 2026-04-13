FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm

# 의존성 설치
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY packages/api/ packages/api/
COPY packages/shared/ packages/shared/
RUN cd packages/api && pnpm prisma generate && pnpm build

# pnpm deploy로 프로덕션 의존성 올바르게 추출
RUN pnpm --filter api deploy /app/deployed --prod

# .prisma/client 복사 (prisma generate 결과물을 모든 위치에)
RUN PRISMA_SRC=$(find /app/node_modules/.pnpm -path '*/.prisma/client' -type d | head -1) && \
    for TARGET_DIR in $(find /app/deployed/node_modules -path '*/.prisma/client' -type d 2>/dev/null); do \
      cp -rL "$PRISMA_SRC"/* "$TARGET_DIR/" 2>/dev/null || true; \
    done && \
    mkdir -p /app/deployed/node_modules/.prisma/client && \
    cp -rL "$PRISMA_SRC"/* /app/deployed/node_modules/.prisma/client/

# 프로덕션 이미지
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/deployed/node_modules ./node_modules
COPY --from=builder /app/deployed/package.json ./

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/main.js"]
