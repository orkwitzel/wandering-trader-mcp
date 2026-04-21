# wandering-trader

A single-player MCP game. You play a trader with seven in-game days to cross a randomly generated region, buying goods cheap in one city and selling them dear in another. Roads are not safe — bandits, sandstorms, and lost-at-sea incidents all cost time or goods. The LLM narrates the journey on top of deterministic, server-rolled mechanics.

The server speaks MCP over stdio. It doesn't do anything useful on its own — connect it to a client.

## Install

Pick one. All three run the same stdio MCP server.

```bash
# From source (requires Bun 1.3.9+)
bun install && bun run src/index.ts

# Pre-built binary — macOS Apple Silicon shown; other platforms listed below
curl -L -o wandering-trader https://github.com/orkwitzel/wandering-trader-mcp/releases/latest/download/wandering-trader-darwin-arm64
chmod +x wandering-trader && ./wandering-trader

# Container
docker run -i --rm -v wandering-trader-data:/data ghcr.io/orkwitzel/wandering-trader-mcp:latest
```

Binary platforms available: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `windows-x64.exe`.

> More install detail (Docker Compose, environment variables, uninstall, pinning versions): [`docs/installing.md`](docs/installing.md).

## Connect to a client

```bash
# Claude Code
claude mcp add wandering-trader -- bun run /absolute/path/to/wandering-trader/src/index.ts

# MCP Inspector (quick tool-by-tool debugging in a browser)
bunx @modelcontextprotocol/inspector bun run src/index.ts
```

Then ask Claude to *"start a wandering-trader run and narrate it"*.

## Tests

```bash
bun test
```

75 tests across engine, DB, and integration layers. Includes a replay-determinism test that asserts byte-identical state under a fixed seed and action sequence.

## Documentation

- [`docs/installing.md`](docs/installing.md) — every install channel in detail (binaries, container, source, Docker Compose)
- [`docs/committing.md`](docs/committing.md) — conventional-commits prefix table (decides each version bump)
- [`docs/releases.md`](docs/releases.md) — how auto-versioning and artifact publishing work
- [`AGENTS.md`](AGENTS.md) — contributor guide for humans and AI agents
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — design spec
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — implementation plan

## License

MIT — see [`LICENSE`](LICENSE).
