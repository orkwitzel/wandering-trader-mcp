FROM oven/bun:1.3.9-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

ENV WANDERING_TRADER_DB=/data/wandering-trader.db
VOLUME ["/data"]

CMD ["bun", "run", "src/index.ts"]
