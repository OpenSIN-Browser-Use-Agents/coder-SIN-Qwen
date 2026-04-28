FROM node:20-slim AS base
RUN apt-get update && apt-get install -y chromium git ca-certificates && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROME_CDP_URL=http://127.0.0.1:9222
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/qwen-core/package.json ./packages/qwen-core/package.json
COPY apps/qwen-connector/package.json ./apps/qwen-connector/package.json
RUN corepack enable && pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN node ./scripts/build.mjs

FROM base AS runner
COPY --from=build /app /app
CMD ["node", "./index.js"]
