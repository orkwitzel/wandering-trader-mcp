# wandering-trader

A single-player MCP game. You play a trader with seven in-game days to cross a randomly generated region, buying goods cheap in one city and selling them dear in another. Roads are not safe — bandits, sandstorms, and lost-at-sea incidents all cost time or goods. The LLM narrates the journey on top of deterministic, server-rolled mechanics.

## Install

Pick whichever matches your setup. The server always speaks MCP over stdio — connect it to a client (see below).

### From source

```bash
bun install
bun run src/index.ts
```

### Pre-built binary (GitHub Releases)

Each tagged release ships standalone binaries for Linux, macOS (Intel and Apple Silicon), and Windows. No Bun install needed.

```bash
# macOS Apple Silicon — adjust arch/OS for your machine
curl -L -o wandering-trader \
  https://github.com/orkwitzel/wandering-trader-mcp/releases/latest/download/wandering-trader-darwin-arm64
chmod +x wandering-trader
./wandering-trader
```

Other artifacts: `wandering-trader-linux-x64`, `wandering-trader-linux-arm64`, `wandering-trader-darwin-x64`, `wandering-trader-windows-x64.exe`.

### Container image (GHCR)

```bash
docker pull ghcr.io/orkwitzel/wandering-trader-mcp:latest
docker run -i --rm ghcr.io/orkwitzel/wandering-trader-mcp:latest
```

## Running

### Option 1 — MCP Inspector (debugger)

```bash
bunx @modelcontextprotocol/inspector bun run src/index.ts
```

Open the URL it prints. Call `start_game`, copy the returned `session_id`, and exercise the other tools.

### Option 2 — Claude Code (play the game)

```bash
claude mcp add wandering-trader -- bun run /absolute/path/to/wandering-trader/src/index.ts
```

Then ask Claude to *"start a wandering-trader run and narrate it"*.

### Option 3 — Docker

No Bun install needed. From the repo root:

```bash
docker compose build
docker compose run --rm wandering-trader
```

SQLite state is persisted in a named volume (`wandering-trader-data`) so runs survive across invocations.

To wire the container into an MCP client, point it at a `docker run` command:

```bash
docker run -i --rm -v wandering-trader-data:/data wandering-trader:local
```

`-i` keeps stdin open so the client can speak MCP. The `--rm` removes the ephemeral container once the client disconnects.

## Tests

```bash
bun test
```

75 tests across engine, DB, and integration layers. Includes a replay-determinism test that asserts byte-identical state under a fixed seed and action sequence.

## Releases

Versioning is automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/). Use the right prefix on every commit to `main` — release-please reads them and decides the next version.

| Commit prefix | Bump | Appears in changelog | Example |
|---|---|---|---|
| `feat:` | minor (0.1.0 → 0.2.0) | ✅ "Features" | `feat: hire scouts reveal encounter odds preview` |
| `fix:` | patch (0.1.0 → 0.1.1) | ✅ "Bug Fixes" | `fix: clamp encounter odds at 5%` |
| `perf:` | patch | ✅ "Performance" | `perf: memoize archetype price multipliers` |
| `refactor:` | patch | ✅ "Refactoring" | `refactor: extract findEdge helper` |
| `chore:` / `docs:` / `test:` / `ci:` | none | ❌ hidden | `chore: tidy imports` |
| `feat!:` or `BREAKING CHANGE:` footer | **major** (0.1.0 → 1.0.0) | ✅ "Features" with warning | `feat!: rename session_id to run_id` |

Scopes are supported and encouraged: `feat(engine): …`, `fix(mcp): …`, `test(integration): …`.

### What happens after you push

1. The release workflow runs tests + typecheck.
2. Release-please opens (or updates) a single **Release PR** titled `chore: release X.Y.Z` that bundles everything since the last tag. The PR body is an auto-generated changelog.
3. You review and merge the Release PR when you're ready to cut a release.
4. Merging creates the git tag, a GitHub Release, builds the multi-arch Docker image to `ghcr.io/orkwitzel/wandering-trader-mcp:X.Y.Z` (plus `:latest`), and attaches the five platform binaries to the Release.

Individual commits on `main` do **not** cut a release by themselves — only merging the Release PR does. That lets you batch several changes into a single version bump.

### Manually forcing a version bump

If you want to release the current `main` as e.g. `1.0.0` without any qualifying commits, append an empty commit:

```bash
git commit --allow-empty -m "chore: release 1.0.0" -m "Release-As: 1.0.0"
git push
```

Release-please will pick up the `Release-As:` footer on its next run and open a Release PR at that version.

## Layout

```
src/
  engine/        pure functions — PRNG, world gen, economy, travel, encounters, tally
  db/            SQLite schema + games CRUD + event log
  mcp/tools/     thin MCP tool handlers (parse args → service call → structured response)
  service.ts     orchestration layer — loads/saves state, drives engine + db together
  index.ts       MCP server entry point (stdio transport)
tests/
  engine/        unit tests per engine module
  db/            DB round-trip tests
  integration/   end-to-end tests against the service layer
docs/superpowers/
  specs/         design spec
  plans/         implementation plan
```

## Design notes

- **Stateless server, persistent state.** Every tool takes a `session_id`; state lives in SQLite keyed by that id.
- **Seeded determinism.** Each game stores its PRNG state; all randomness (map, prices, encounter rolls) draws from it. Bugs are reproducible; replay tests are trivial.
- **The LLM narrates, it does not decide.** Every tool returns a `structuredContent` payload with the authoritative mechanics plus a `text` field. Narration must not contradict the data.
- **Run length is 7 in-game days.** Travel time depends on distance, terrain, weather, active events, and carried weight. Score at the end is gold + inventory sell-value at the final city.

See `docs/superpowers/specs/` for the full design.

## License

MIT — see `LICENSE`.
