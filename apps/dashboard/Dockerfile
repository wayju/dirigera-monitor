# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --reporter=append-only

# Copy source
COPY . .

# Build (no need for NEXT_PUBLIC_API_URL - runtime config handles it)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy startup script for runtime env injection
COPY --chmod=755 env.sh /app/env.sh

# Public folder needs to be writable for runtime config
RUN chown nextjs:nodejs /app/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use startup script as entrypoint to generate runtime config
ENTRYPOINT ["/app/env.sh"]
CMD ["node", "server.js"]
