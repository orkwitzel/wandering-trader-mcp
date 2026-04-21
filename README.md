# wandering-trader

A single-player MCP game. You play a trader with seven in-game days to cross a randomly generated region, buying goods cheap in one city and selling them dear in another. Roads are not safe — bandits, sandstorms, and lost-at-sea incidents all cost time or goods. The LLM narrates the journey on top of deterministic, server-rolled mechanics.

## Running

```bash
bun install
bun run src/index.ts
```

The server speaks MCP over stdio. It won't do anything useful on its own — connect it to a client.

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

70 tests across engine, DB, and integration layers. Includes a replay-determinism test that asserts byte-identical state under a fixed seed and action sequence.

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
