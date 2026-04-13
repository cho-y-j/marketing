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

# 프로덕션 이미지
FROM node:20-alpine

WORKDIR /app
RUN npm install -g pnpm

COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/package.json ./
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/main.js"]
