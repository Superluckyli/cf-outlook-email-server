# Self-hosted build of cf-outlook-email (Outlook 邮箱管理)
# Runs the same Hono app + SQLite (D1-compatible adapter) under Node 22.
FROM node:22-alpine

WORKDIR /app

# pnpm is needed because the project is managed with pnpm
RUN corepack enable

# Install deps first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source + static assets
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY migrations ./migrations

# Runtime
ENV PORT=8787
ENV DB_PATH=/data/outlook-email.db
ENV MIGRATIONS_DIR=/app/migrations
ENV PUBLIC_DIR=/app/public

EXPOSE 8787

# Data volume for SQLite
VOLUME ["/data"]

CMD ["pnpm", "run", "serve"]
