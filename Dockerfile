FROM oven/bun:1.3.9-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

ENV WANDERING_TRADER_DB=/data/wandering-trader.db
VOLUME ["/data"]

# Default to stdio transport; override with MCP_TRANSPORT=http for hosted deploys.
ENV MCP_TRANSPORT=stdio
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
