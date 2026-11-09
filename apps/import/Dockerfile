# Build context is the repository root (image_build_context in apps/import/wrangler.jsonc).
# The process is the same importer as `node scripts/import-awesome.ts --slow`.
FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools

RUN pnpm install --frozen-lockfile --filter @tgbox/telegram...

ENV NODE_OPTIONS=--experimental-strip-types
EXPOSE 8080
CMD ["node", "apps/import/src/server.ts"]
