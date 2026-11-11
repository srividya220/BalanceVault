# Multi-stage Dockerfile for BalanceVault Backend API
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci --no-audit --no-fund
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts

RUN npm run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --no-audit --no-fund
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

EXPOSE 8080

CMD ["node", "dist/server.js"]
