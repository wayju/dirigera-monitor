# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --reporter=append-only

# Generate Prisma client
RUN pnpm db:generate

# Copy source
COPY . .

# Build
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/healthcheck.js ./

# Expose port (configurable via PORT env)
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js

# Create data directory and start server (Prisma db push on first run)
RUN mkdir -p /app/data
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
