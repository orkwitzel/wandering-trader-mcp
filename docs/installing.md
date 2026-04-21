# Installing

The wandering-trader MCP server runs locally and speaks MCP over stdio. Three install channels; pick whichever matches your setup.

## 1. Pre-built binary (recommended for most users)

Every tagged release ships standalone, self-contained binaries built with `bun build --compile`. No Bun install needed.

Supported platforms:
- `wandering-trader-linux-x64`
- `wandering-trader-linux-arm64`
- `wandering-trader-darwin-x64`
- `wandering-trader-darwin-arm64`
- `wandering-trader-windows-x64.exe`

```bash
# macOS Apple Silicon example — swap the suffix for your platform
curl -L -o wandering-trader \
  https://github.com/orkwitzel/wandering-trader-mcp/releases/latest/download/wandering-trader-darwin-arm64
chmod +x wandering-trader
./wandering-trader
```

The server will sit and wait for MCP messages on stdin. Connect a client (see below).

## 2. Container image (GHCR)

```bash
docker pull ghcr.io/orkwitzel/wandering-trader-mcp:latest
docker run -i --rm -v wandering-trader-data:/data ghcr.io/orkwitzel/wandering-trader-mcp:latest
```

`-i` keeps stdin open so the client can speak MCP. `-v wandering-trader-data:/data` persists the SQLite game state across invocations.

Pin to a specific version:

```bash
docker pull ghcr.io/orkwitzel/wandering-trader-mcp:0.1.0
```

### Docker Compose for development

```bash
docker compose build
docker compose run --rm wandering-trader
```

SQLite state persists in a named volume (`wandering-trader-data`).

## 3. From source

Requires [Bun](https://bun.com) 1.3.9+.

```bash
git clone https://github.com/orkwitzel/wandering-trader-mcp.git
cd wandering-trader-mcp
bun install
bun run src/index.ts
```

## Connecting a client

### Claude Code

```bash
# Binary
claude mcp add wandering-trader -- /absolute/path/to/wandering-trader

# From source
claude mcp add wandering-trader -- bun run /absolute/path/to/wandering-trader-mcp/src/index.ts

# Container
claude mcp add wandering-trader -- docker run -i --rm -v wandering-trader-data:/data ghcr.io/orkwitzel/wandering-trader-mcp:latest
```

Then ask Claude to *"start a wandering-trader run and narrate it"*.

### MCP Inspector (browser-based debugger)

```bash
bunx @modelcontextprotocol/inspector bun run src/index.ts
```

Open the URL it prints. Click **Connect** → **List Tools** to see all 13. Useful for exercising individual tools and inspecting raw JSON responses.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WANDERING_TRADER_DB` | `./wandering-trader.db` (source/binary) or `/data/wandering-trader.db` (container) | Path to the SQLite file that stores game state. |

## Uninstall

Delete the binary / remove the container / `rm -rf` the clone. The only persistent state is the SQLite file; remove it to wipe all saved runs.
