# AGENTS.md

Orientation for AI coding agents working on this repo. `CLAUDE.md` imports this file, so Claude Code and other agents read the same guidance.

## Start here

- `README.md` — what the game is, how to run it.
- `docs/superpowers/specs/2026-04-21-wandering-trader-design.md` — the canonical design. If the code surprises you, the spec is the source of truth.
- `docs/superpowers/plans/2026-04-21-wandering-trader.md` — the implementation plan the codebase was built against. Useful as a ground-truth map of which file does what.

## Stack

- Bun + TypeScript (`bun test`, `bun run`, `bun build` — never `npm`/`node`/`vitest`)
- `bun:sqlite` (never `better-sqlite3`)
- `@modelcontextprotocol/sdk` + `zod`

## Where things live

| Concern | File |
|---|---|
| Seeded PRNG | `src/engine/rng.ts` |
| Shared types | `src/engine/types.ts` |
| Tunable constants | `src/engine/content.ts` |
| World generation | `src/engine/world-gen.ts` |
| Price dynamics | `src/engine/economy.ts` |
| Inventory + weight | `src/engine/inventory.ts` |
| Travel time + encounter rolls | `src/engine/travel.ts` |
| Encounter odds + resolution | `src/engine/encounters.ts` |
| End-of-run scoring | `src/engine/tally.ts` |
| SQLite schema + CRUD | `src/db/schema.ts`, `src/db/games.ts` |
| Orchestration | `src/service.ts` |
| MCP tools | `src/mcp/tools/*.ts` |
| Server entry | `src/index.ts` |

## Layering (enforce this when adding code)

- `src/engine/*` — **pure functions**. No I/O. No `Math.random()`. No `Date.now()` in any gameplay path — all randomness goes through the seeded PRNG in `src/engine/rng.ts`. Non-determinism here breaks the replay test.
- `src/db/*` — SQLite access, transactional. The only layer that imports `bun:sqlite`.
- `src/mcp/tools/*` — thin handlers. Parse args → call service → return `{ content: [...], structuredContent: ... }`. No gameplay logic.
- `src/service.ts` — orchestration. Loads state, calls engine, saves state, logs events. The one place DB and engine meet.

A tool handler should rarely be more than ~15 lines. If it's doing real work, extract to service.

## Invariants you should preserve

- **Determinism.** Same seed + same action sequence → byte-identical final state (asserted by `tests/integration/replay.test.ts`). Every RNG consumer must route through `loaded.rng_state`.
- **No mutation from LLM invention.** The MCP tool returns authoritative structured data; the LLM narrates on top. If a tool's structured output doesn't say a merchant is there, the merchant isn't there.
- Runs are fixed at 7 in-game days (`DAY_LIMIT` in `src/engine/types.ts`).
- Bodyguards suppress hostile encounters; matching terrain guides suppress environmental encounters. **Bodyguards do not help against environmental encounters** — this is a spec decision, not a bug.
- Pricing has three forces: archetype baseline + drift + local memory + active events. All three are asserted by `tests/engine/economy.test.ts`.
- Weight is a soft continuous penalty on travel time and encounter odds, not a hard cap.

## MCP SDK gotchas

- Imports: `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js` (with `.js`). Don't use `/dist/esm/...` paths — the package's wildcard export handles it.
- `registerTool(name, { title, description, inputSchema }, handler)` — `inputSchema` is a plain zod shape (not wrapped in `z.object`).
- `structuredContent` must be `Record<string, unknown>`. Use `res as unknown as Record<string, unknown>` in every tool handler — the SDK's type signature requires it.

## How to add a feature

1. If it's gameplay, update the spec first or note the change in its own section.
2. Decide which layer owns it:
   - Pure logic → `src/engine/<module>.ts` + `tests/engine/<module>.test.ts`
   - Persistence → `src/db/*`
   - New player action → new MCP tool in `src/mcp/tools/*.ts`, new service method in `src/service.ts`
3. Write the test first. `bun test tests/.../your-test.test.ts`.
4. Implement.
5. Run the full suite: `bun test`. Run `bunx tsc --noEmit` if you touched types.
6. If you touched anything random, run the replay test specifically.

## Balance coefficients

All tunable numbers (commodity prices, archetype multipliers, encounter rates, hire wages, etc.) live in `src/engine/content.ts`. One file makes rebalancing a single-commit change. Don't scatter magic numbers across engine files.

## House style

- Small, focused files. If a file feels like it's doing two things, it probably is.
- TypeScript strict mode is on — respect the types. Don't cast to `any` to get past a real error; solve the real error.
- Test what behavior looks like from outside a module, not internal state.
- Prefer named exports; no default exports.

## Don't

- Don't use `git add -A` or `git add .` — always stage named files.
- Don't introduce `Math.random()` or `Date.now()` in `src/engine/` or `src/service.ts` (breaks replay).
- Don't add gameplay decisions to tool handlers — push them into the service or engine.
- Don't commit unless explicitly asked to.
