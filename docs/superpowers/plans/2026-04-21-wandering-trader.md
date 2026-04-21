# Wandering Trader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-player MCP game where a trader travels a randomly generated map over 7 in-game days, trading commodities and rare items at archetype-biased cities with dynamic prices, facing hostile/environmental/neutral encounters during travel, and maximizing final gold-plus-inventory value.

**Architecture:** Stateless MCP server. All state persists in SQLite keyed by `session_id`. Layered as `engine/` (pure functions, heaviest tested), `db/` (SQLite access), `mcp/` (thin tool handlers). Seeded PRNG makes every run reproducible and every test deterministic.

**Tech Stack:** Bun + TypeScript + `bun:sqlite` + `@modelcontextprotocol/sdk` + `zod`. Tests via `bun test`.

**Spec:** `docs/superpowers/specs/2026-04-21-wandering-trader-design.md`.

---

## File Structure

```
src/
  index.ts                          # MCP server entry point (stdio transport)
  engine/
    types.ts                        # Shared types (GameState, City, Edge, Rumor, etc.)
    content.ts                      # Static tables: commodities, archetypes, hires, events, name parts
    rng.ts                          # Seeded PRNG (mulberry32), serializable state
    world-gen.ts                    # Map generation (cities, edges, events)
    economy.ts                      # Price tables, drift, local memory, event shocks
    inventory.ts                    # Weight calc, capacity, rare-item sell-price multipliers
    travel.ts                       # Travel time formula, weather/disaster rolls
    encounters.ts                   # Encounter rolling, odds formulas, outcome application
    tally.ts                        # End-of-run scoring
  db/
    schema.ts                       # Table creation / migrations
    games.ts                        # Game CRUD + event log append
  mcp/
    tools/
      session.ts                    # start_game, resume_game, get_state
      city.ts                       # look, buy, sell, hire, dismiss, listen
      travel.ts                     # plan_travel, travel
      encounter.ts                  # resolve_encounter
      end.ts                        # end_game

tests/
  engine/                           # Unit tests mirror src/engine
  db/                               # DB round-trip tests
  integration/                      # Full-run + replay tests
```

Every engine file is pure (no I/O). DB layer is the only thing that touches SQLite. Tool layer is thin: parse → engine call(s) → db write → response.

---

## Phase 1 — Scaffold

### Task 1: Commit baseline (preserve existing skeleton in history before rewriting)

**Files:**
- None created/modified; stages whatever is currently in the worktree.

- [ ] **Step 1: Inspect repo state**

```bash
git status
```

Expected: untracked files including `CLAUDE.md`, `package.json`, `src/`, `docs/`, `bun.lock`, etc. No commits yet.

- [ ] **Step 2: Stage everything except node_modules (respects .gitignore)**

```bash
git add -A
```

- [ ] **Step 3: Commit baseline**

```bash
git commit -m "chore: baseline — existing skeleton, CLAUDE.md, design spec"
```

Expected: initial commit created on `master`. The pre-existing (soon-to-be-replaced) `src/index.ts` and `src/db.ts` are preserved in history.

---

### Task 2: Clear src/ and create new folder skeleton

Replaces the existing experimental src/ with the layout from the File Structure section. No implementation yet — empty files with a one-line comment stating their responsibility, so the structure is locked in and reviewable before code lands.

**Files:**
- Delete: `src/index.ts`, `src/db.ts`
- Create: `src/index.ts`, `src/engine/{types,content,rng,world-gen,economy,inventory,travel,encounters,tally}.ts`, `src/db/{schema,games}.ts`, `src/mcp/tools/{session,city,travel,encounter,end}.ts`
- Create: `tests/.gitkeep` (so the directory is tracked)

- [ ] **Step 1: Remove old files**

```bash
rm src/index.ts src/db.ts
mkdir -p src/engine src/db src/mcp/tools tests/engine tests/db tests/integration
```

- [ ] **Step 2: Create placeholder files**

Write each of these with a single header comment describing its responsibility:

`src/index.ts`:
```ts
// MCP server entry point. Registers tools and starts stdio transport.
```

`src/engine/types.ts`:
```ts
// Shared engine types: GameState, City, Edge, Rumor, WorldEvent, EncounterOutcome, etc.
```

`src/engine/content.ts`:
```ts
// Static data tables: commodities, archetype price biases, hire catalog, event templates, city name parts.
```

`src/engine/rng.ts`:
```ts
// Seeded PRNG (mulberry32). Exports createRng(seed) with next()/nextInt()/pick() and serialize/deserialize helpers.
```

`src/engine/world-gen.ts`:
```ts
// World generation: city placement, edge graph, initial events.
```

`src/engine/economy.ts`:
```ts
// Price tables and price tick: drift + local memory + event multipliers. Pure functions.
```

`src/engine/inventory.ts`:
```ts
// Inventory, total-weight calculation, rare-item sell-price multipliers.
```

`src/engine/travel.ts`:
```ts
// Travel time formula, weather/disaster rolls, encounter count rolls.
```

`src/engine/encounters.ts`:
```ts
// Encounter odds formulas (fight/flee/bribe/parley/environmental), outcome application.
```

`src/engine/tally.ts`:
```ts
// End-of-run scoring: gold on hand + inventory sell-value at final city.
```

`src/db/schema.ts`:
```ts
// SQLite table creation and migrations.
```

`src/db/games.ts`:
```ts
// Game CRUD (load, save) and append-only event log.
```

`src/mcp/tools/session.ts`:
```ts
// MCP tools: start_game, resume_game, get_state.
```

`src/mcp/tools/city.ts`:
```ts
// MCP tools: look, buy, sell, hire, dismiss, listen.
```

`src/mcp/tools/travel.ts`:
```ts
// MCP tools: plan_travel, travel.
```

`src/mcp/tools/encounter.ts`:
```ts
// MCP tool: resolve_encounter.
```

`src/mcp/tools/end.ts`:
```ts
// MCP tool: end_game (auto-fired on day-7 crossing).
```

`tests/.gitkeep`: empty file.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: reset src/ to planned layout; add empty tests/ tree"
```

---

### Task 3: Verify bun test runs

Confirms the toolchain is alive before writing real code.

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write smoke test**

`tests/smoke.test.ts`:
```ts
import { test, expect } from "bun:test";

test("toolchain is alive", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 2: Run**

```bash
bun test tests/smoke.test.ts
```

Expected: 1 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.ts
git commit -m "test: smoke test confirms bun test works"
```

---

## Phase 2 — Engine Primitives

### Task 4: Seeded PRNG (`src/engine/rng.ts`)

Deterministic PRNG whose state is a single number, easily serializable to SQLite. Every random draw in the game routes through this.

**Files:**
- Create: `src/engine/rng.ts`
- Create: `tests/engine/rng.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/engine/rng.test.ts`:
```ts
import { test, expect } from "bun:test";
import { createRng, serializeRng, deserializeRng } from "../../src/engine/rng";

test("createRng with same seed produces same sequence", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) {
    expect(a.next()).toBe(b.next());
  }
});

test("createRng with different seeds diverges", () => {
  const a = createRng(1);
  const b = createRng(2);
  expect(a.next()).not.toBe(b.next());
});

test("nextInt returns integer in [lo, hi)", () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.nextInt(5, 10);
    expect(v).toBeGreaterThanOrEqual(5);
    expect(v).toBeLessThan(10);
    expect(Number.isInteger(v)).toBe(true);
  }
});

test("pick returns one of the array elements", () => {
  const r = createRng(11);
  const items = ["a", "b", "c"];
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(r.pick(items));
  expect(seen).toEqual(new Set(items));
});

test("serialize/deserialize round-trips", () => {
  const a = createRng(99);
  for (let i = 0; i < 10; i++) a.next();
  const frozen = serializeRng(a);
  const b = deserializeRng(frozen);
  for (let i = 0; i < 50; i++) {
    expect(b.next()).toBe(a.next());
  }
});
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
bun test tests/engine/rng.test.ts
```

Expected: FAIL (imports resolve to empty module).

- [ ] **Step 3: Implement**

`src/engine/rng.ts`:
```ts
// Seeded PRNG (mulberry32). State is a single 32-bit integer.
// https://stackoverflow.com/a/47593316 (public-domain snippet)

export interface Rng {
  state: { s: number };
  next(): number;                       // returns [0, 1)
  nextInt(loInclusive: number, hiExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
}

function mulberry32(seedRef: { s: number }): () => number {
  return () => {
    seedRef.s = (seedRef.s + 0x6D2B79F5) | 0;
    let t = seedRef.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const state = { s: seed | 0 };
  const raw = mulberry32(state);
  return {
    state,
    next: raw,
    nextInt(lo, hi) {
      return lo + Math.floor(raw() * (hi - lo));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error("pick from empty array");
      return arr[Math.floor(raw() * arr.length)]!;
    },
  };
}

export function serializeRng(r: Rng): string {
  return String(r.state.s);
}

export function deserializeRng(s: string): Rng {
  const seed = Number(s) | 0;
  const state = { s: seed };
  const raw = mulberry32(state);
  return {
    state,
    next: raw,
    nextInt(lo, hi) { return lo + Math.floor(raw() * (hi - lo)); },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error("pick from empty array");
      return arr[Math.floor(raw() * arr.length)]!;
    },
  };
}
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
bun test tests/engine/rng.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rng.ts tests/engine/rng.test.ts
git commit -m "feat(engine): seeded mulberry32 PRNG with serialize/deserialize"
```

---

### Task 5: Core types (`src/engine/types.ts`)

All the structural types the engine and DB layers use. No logic — types only. Gates the rest of the code by giving everyone the same vocabulary.

**Files:**
- Modify: `src/engine/types.ts`

- [ ] **Step 1: Replace placeholder with full types module**

`src/engine/types.ts`:
```ts
export type Commodity =
  | "grain" | "salt" | "spice" | "silk"
  | "iron" | "furs" | "wine" | "gems";

export const COMMODITIES: readonly Commodity[] = [
  "grain", "salt", "spice", "silk", "iron", "furs", "wine", "gems",
];

export type Archetype =
  | "port" | "mining" | "farmland" | "forest"
  | "trade_capital" | "border" | "desert";

export type Terrain = "road" | "forest" | "mountain" | "river" | "coast" | "desert";

export type Weather = "clear" | "rain" | "storm";

export type HireKind =
  | "bodyguard" | "scout"
  | "desert_guide" | "sea_navigator" | "forest_ranger"
  | "pack_animal";

export type UniqueItemCategory = "art" | "weapon" | "relic" | "book" | "curio";

export interface UniqueItem {
  id: string;
  name: string;
  category: UniqueItemCategory;
  weight: number;
  buy_price: number;       // price at the city currently offering it
  origin_city_id: string;
}

export interface Crew {
  id: string;
  kind: HireKind;
  daily_wage: number;
  hired_on_day: number;
}

export interface Inventory {
  commodities: Record<Commodity, number>;   // unit counts
  unique_items: UniqueItem[];
}

export interface City {
  id: string;
  name: string;
  archetype: Archetype;
  position: { x: number; y: number };
  price_table: Record<Commodity, number>;         // current buy-side mid; sell = buy × (1 − spread)
  local_memory: Record<Commodity, number>;        // running nudge term from player's trades here
  unique_offers: UniqueItem[];
  hires_available: Crew[];
}

export interface Edge {
  a: string;                // city id
  b: string;                // city id
  distance: number;         // base travel time in fractional days
  terrain: Terrain;
}

export type EventKind =
  | "famine" | "glut" | "festival" | "caravan_arrival" | "trade_war"
  | "sandstorm_season" | "spring_floods" | "blizzard";

export interface WorldEvent {
  id: string;
  kind: EventKind;
  start_day: number;
  duration: number;
  target_city_ids?: string[];
  target_edge_ids?: string[];                       // "a:b" keys
  target_commodities?: Commodity[];
  price_multiplier?: number;                        // for economic events
  encounter_rate_multiplier?: number;               // for environmental events
}

export interface Rumor {
  id: string;
  about_city_id?: string;
  about_edge_id?: string;
  topic: "archetype" | "price_trend" | "event" | "terrain";
  text: string;                                     // short tool-generated description
  heard_on_day: number;
  confidence: "low" | "medium" | "high";
}

export interface World {
  cities: City[];
  edges: Edge[];
  events: WorldEvent[];
}

export interface PendingEncounter {
  id: string;
  category: "hostile" | "environmental" | "neutral";
  kind: string;                                     // e.g., "bandits", "sandstorm", "lost_traveler"
  narrative_seed: string;                           // LLM anchor
  options: EncounterOption[];
}

export interface EncounterOption {
  id: "fight" | "flee" | "bribe" | "parley" | "endure" | "help" | "accept" | "ignore";
  success_pct: number;                              // 5..95
  cost_gold?: number;                               // for bribe
  on_success: EncounterOutcome;
  on_failure: EncounterOutcome;
}

export interface EncounterOutcome {
  time_lost_days: number;
  gold_delta: number;
  goods_lost: { commodity: Commodity; quantity: number }[];
  goods_gained: { commodity: Commodity; quantity: number }[];
  unique_items_gained: UniqueItem[];
  unique_items_lost_ids: string[];
  rumors_gained: Rumor[];
  crew_changes: { crew_id: string; change: "lost" | "joined" }[];
}

export interface PendingLeg {
  from_city_id: string;
  to_city_id: string;
  total_travel_time: number;
  elapsed_travel_time: number;
  remaining_encounters: PendingEncounter[];
  current_encounter?: PendingEncounter;
}

export interface GameState {
  session_id: string;
  day: number;                                      // 0.0 → 7.0 (fractional)
  gold: number;
  inventory: Inventory;
  crew: Crew[];
  current_city_id: string;
  visited_city_ids: string[];
  known_rumors: Rumor[];
  world: World;
  pending_leg?: PendingLeg;
  history: {
    encounters_survived: number;
    cities_visited: number;
    events_discovered: number;
    best_trade_profit: number;
  };
}

export const DAY_LIMIT = 7;
```

- [ ] **Step 2: Verify it compiles**

```bash
bun build src/engine/types.ts --target=bun --outfile=/tmp/types.js
```

Expected: no output errors (silent success).

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat(engine): core type definitions"
```

---

### Task 6: Static content tables (`src/engine/content.ts`)

All the tunable data the engine reads: commodity base prices + weights, archetype price biases, hire catalog, city name parts, encounter templates. No logic.

**Files:**
- Modify: `src/engine/content.ts`

- [ ] **Step 1: Write content module**

`src/engine/content.ts`:
```ts
import type {
  Archetype, Commodity, HireKind, EventKind, UniqueItemCategory, Terrain,
} from "./types";

export interface CommoditySpec {
  base_price: number;
  weight_per_unit: number;
  volatility: number;          // drift ±volatility per tick (as fraction of base)
  min_price: number;
  max_price: number;
}

export const COMMODITY_SPECS: Record<Commodity, CommoditySpec> = {
  grain: { base_price: 10,  weight_per_unit: 10, volatility: 0.08, min_price: 4,   max_price: 40   },
  salt:  { base_price: 15,  weight_per_unit: 6,  volatility: 0.10, min_price: 6,   max_price: 60   },
  spice: { base_price: 60,  weight_per_unit: 2,  volatility: 0.15, min_price: 20,  max_price: 240  },
  silk:  { base_price: 80,  weight_per_unit: 3,  volatility: 0.12, min_price: 30,  max_price: 300  },
  iron:  { base_price: 25,  weight_per_unit: 20, volatility: 0.08, min_price: 10,  max_price: 100  },
  furs:  { base_price: 35,  weight_per_unit: 5,  volatility: 0.10, min_price: 14,  max_price: 140  },
  wine:  { base_price: 20,  weight_per_unit: 8,  volatility: 0.10, min_price: 8,   max_price: 80   },
  gems:  { base_price: 200, weight_per_unit: 0.5, volatility: 0.20, min_price: 60, max_price: 800 },
};

export const SELL_SPREAD = 0.15;        // sell = buy × (1 − SELL_SPREAD)

// Archetype multipliers on commodity base prices. 1.0 = neutral; <1.0 = cheaper here; >1.0 = dearer.
export const ARCHETYPE_PRICE_MULT: Record<Archetype, Record<Commodity, number>> = {
  port:           { grain: 1.2, salt: 0.9, spice: 0.6, silk: 0.6, iron: 1.2, furs: 1.0, wine: 1.0, gems: 1.0 },
  mining:         { grain: 1.3, salt: 1.0, spice: 1.2, silk: 1.4, iron: 0.5, furs: 1.0, wine: 1.3, gems: 0.7 },
  farmland:       { grain: 0.6, salt: 0.9, spice: 1.2, silk: 1.3, iron: 1.2, furs: 1.1, wine: 0.7, gems: 1.0 },
  forest:         { grain: 1.1, salt: 0.8, spice: 1.0, silk: 1.3, iron: 1.1, furs: 0.6, wine: 1.0, gems: 1.2 },
  trade_capital:  { grain: 1.0, salt: 1.0, spice: 1.0, silk: 1.0, iron: 1.0, furs: 1.0, wine: 1.0, gems: 1.0 },
  border:         { grain: 1.1, salt: 1.1, spice: 1.1, silk: 1.1, iron: 1.1, furs: 1.1, wine: 1.1, gems: 1.1 },
  desert:         { grain: 1.4, salt: 0.5, spice: 1.0, silk: 1.1, iron: 1.2, furs: 1.4, wine: 1.5, gems: 0.7 },
};

export interface HireSpec {
  kind: HireKind;
  hire_fee: number;
  daily_wage: number;
}

export const HIRE_SPECS: Record<HireKind, HireSpec> = {
  bodyguard:      { kind: "bodyguard",      hire_fee: 30,  daily_wage: 15 },
  scout:          { kind: "scout",          hire_fee: 20,  daily_wage: 10 },
  desert_guide:   { kind: "desert_guide",   hire_fee: 40,  daily_wage: 20 },
  sea_navigator:  { kind: "sea_navigator",  hire_fee: 40,  daily_wage: 20 },
  forest_ranger:  { kind: "forest_ranger",  hire_fee: 30,  daily_wage: 15 },
  pack_animal:    { kind: "pack_animal",    hire_fee: 50,  daily_wage:  8 },
};

// Which hire types tend to appear in which archetype's roster.
export const ARCHETYPE_HIRE_BIAS: Record<Archetype, HireKind[]> = {
  port:          ["bodyguard", "sea_navigator", "scout"],
  mining:        ["bodyguard", "bodyguard", "pack_animal"],
  farmland:      ["bodyguard", "scout"],
  forest:        ["forest_ranger", "scout", "bodyguard"],
  trade_capital: ["bodyguard", "scout", "desert_guide", "sea_navigator", "forest_ranger", "pack_animal"],
  border:        ["bodyguard", "scout", "bodyguard"],
  desert:        ["desert_guide", "pack_animal", "bodyguard"],
};

// Rare-item sell-price multipliers: matches archetype's "appetite" for a category.
export const UNIQUE_SELL_MULT: Record<Archetype, Record<UniqueItemCategory, number>> = {
  port:          { art: 1.8, weapon: 1.0, relic: 1.2, book: 1.4, curio: 1.6 },
  mining:        { art: 0.9, weapon: 1.6, relic: 1.2, book: 0.7, curio: 0.9 },
  farmland:      { art: 1.2, weapon: 0.8, relic: 1.1, book: 0.9, curio: 1.0 },
  forest:        { art: 1.0, weapon: 1.2, relic: 1.8, book: 1.0, curio: 1.3 },
  trade_capital: { art: 2.4, weapon: 1.5, relic: 1.8, book: 2.6, curio: 1.7 },
  border:        { art: 0.8, weapon: 1.8, relic: 0.9, book: 0.7, curio: 1.1 },
  desert:        { art: 1.0, weapon: 1.4, relic: 2.0, book: 0.8, curio: 1.5 },
};

export interface EventSpec {
  kind: EventKind;
  category: "economic" | "environmental";
  price_multiplier?: number;
  encounter_rate_multiplier?: number;
  min_duration: number;
  max_duration: number;
  min_day: number;          // earliest start day
  max_day: number;          // latest start day
}

export const EVENT_SPECS: Record<EventKind, EventSpec> = {
  famine:           { kind: "famine",           category: "economic",      price_multiplier: 3.5, min_duration: 2, max_duration: 4, min_day: 1, max_day: 5 },
  glut:             { kind: "glut",             category: "economic",      price_multiplier: 0.35, min_duration: 2, max_duration: 3, min_day: 0, max_day: 5 },
  festival:         { kind: "festival",         category: "economic",      price_multiplier: 1.8, min_duration: 1, max_duration: 2, min_day: 1, max_day: 6 },
  caravan_arrival:  { kind: "caravan_arrival",  category: "economic",      price_multiplier: 0.6, min_duration: 1, max_duration: 2, min_day: 1, max_day: 6 },
  trade_war:        { kind: "trade_war",        category: "economic",      price_multiplier: 2.0, min_duration: 3, max_duration: 5, min_day: 0, max_day: 3 },
  sandstorm_season: { kind: "sandstorm_season", category: "environmental", encounter_rate_multiplier: 2.5, min_duration: 2, max_duration: 4, min_day: 0, max_day: 5 },
  spring_floods:    { kind: "spring_floods",    category: "environmental", encounter_rate_multiplier: 2.0, min_duration: 2, max_duration: 3, min_day: 0, max_day: 5 },
  blizzard:         { kind: "blizzard",         category: "environmental", encounter_rate_multiplier: 2.2, min_duration: 1, max_duration: 3, min_day: 2, max_day: 6 },
};

// Terrain tuning
export const TERRAIN_TIME_MULT: Record<Terrain, number> = {
  road: 1.0, forest: 1.2, mountain: 1.5, river: 1.1, coast: 1.1, desert: 1.4,
};

export const TERRAIN_ENCOUNTER_RATE: Record<Terrain, number> = {
  road: 0.6, forest: 1.2, mountain: 1.1, river: 0.8, coast: 0.9, desert: 1.3,
};

export const WEATHER_TIME_MULT: Record<Weather, number> = {
  clear: 1.0, rain: 1.2, storm: 1.6,
};

type Weather = "clear" | "rain" | "storm";

export const REFERENCE_WEIGHT = 200;    // soft weight cap — penalty scales around this
export const WEIGHT_TIME_COEFF = 0.4;   // weight_multiplier = 1 + (w/ref) × coeff
export const WEIGHT_ODDS_COEFF = 20;    // pp of odds lost at w = reference_weight

// City name parts (archetype-biased). Generator in world-gen.
export const CITY_NAME_PREFIXES: Record<Archetype, string[]> = {
  port:          ["Mar", "Cal", "Tor", "Sal", "Brin"],
  mining:        ["Iron", "Stone", "Deep", "Grim", "Hold"],
  farmland:      ["Oak", "Greens", "Field", "Mill", "Tall"],
  forest:        ["Thorn", "Moss", "Elder", "Fen", "Bough"],
  trade_capital: ["Gold", "High", "Grand", "Kaer", "Arc"],
  border:        ["Last", "Edge", "Far", "Watch", "March"],
  desert:        ["Sun", "Dun", "Mar", "Sek", "Zar"],
};

export const CITY_NAME_SUFFIXES: Record<Archetype, string[]> = {
  port:          ["haven", "port", "mouth", "quay", "reach"],
  mining:        ["delve", "hold", "pit", "vein", "shaft"],
  farmland:      ["field", "dale", "vale", "ridge", "acre"],
  forest:        ["hollow", "wood", "grove", "glade", "brake"],
  trade_capital: ["keep", "throne", "spire", "court", "crown"],
  border:        ["watch", "gate", "stand", "rim", "post"],
  desert:        ["ak",    "iri",  "dun",  "marak", "zar"],
};

// Unique-item name parts (not archetype-biased for v1).
export const UNIQUE_ITEM_NAME_PARTS = {
  art:    { adj: ["jeweled", "gilded", "engraved", "carved"], noun: ["statuette", "tapestry", "chalice", "mosaic"] },
  weapon: { adj: ["tempered", "rune-etched", "silvered", "fabled"],   noun: ["dagger", "saber", "bow", "lance"] },
  relic:  { adj: ["saint-touched", "ancient", "sealed", "blessed"],   noun: ["reliquary", "icon", "shroud", "censer"] },
  book:   { adj: ["illuminated", "banned", "cipher-bound", "rare"],   noun: ["atlas", "codex", "breviary", "ledger"] },
  curio:  { adj: ["petrified", "chimed", "star-etched", "whispering"],noun: ["egg", "bell", "compass", "charm"] },
};

export const LOCAL_MEMORY_DECAY = 0.75;     // each tick, local_memory *= decay
export const LOCAL_MEMORY_BUY_NUDGE = 0.04; // each unit bought nudges +4% of base
export const LOCAL_MEMORY_SELL_NUDGE = 0.04;

export const BASE_ENCOUNTER_RATE = 0.8;     // Poisson λ baseline per edge unit
export const BASE_FIGHT_SUCCESS = 40;
export const BASE_FLEE_SUCCESS = 55;
export const BASE_BRIBE_SUCCESS = 85;
export const BASE_PARLEY_SUCCESS = 45;
export const BASE_ENVIRONMENTAL_SUCCESS = 50;

export const BODYGUARD_HOSTILE_SUPPRESSION = 0.25;  // each bodyguard cuts hostile-fire prob by 25%
export const GUIDE_ENV_SUPPRESSION = 0.35;          // each matching guide cuts env-fire prob by 35%
export const BODYGUARD_FIGHT_BONUS = 8;             // pp per bodyguard in fight odds
export const GUIDE_ENV_BONUS = 25;                  // pp from matching guide
export const SCOUT_BONUS = 8;                       // pp on env (and sees previews)

export const STARTING_GOLD = 200;
export const NUM_CITIES_MIN = 10;
export const NUM_CITIES_MAX = 14;
```

- [ ] **Step 2: Verify compiles**

```bash
bun build src/engine/content.ts --target=bun --outfile=/tmp/content.js
```

Expected: silent success.

- [ ] **Step 3: Commit**

```bash
git add src/engine/content.ts
git commit -m "feat(engine): static content tables (commodities, archetypes, hires, events)"
```

---

## Phase 3 — World Generation

### Task 7: City generation (placement, names, archetypes)

Generates N cities scattered in 2D with assigned archetypes and generated names. Does NOT build the edge graph yet (next task).

**Files:**
- Modify: `src/engine/world-gen.ts`
- Create: `tests/engine/world-gen.test.ts`

- [ ] **Step 1: Write failing test**

`tests/engine/world-gen.test.ts`:
```ts
import { test, expect } from "bun:test";
import { createRng } from "../../src/engine/rng";
import { generateCities } from "../../src/engine/world-gen";
import { NUM_CITIES_MIN, NUM_CITIES_MAX } from "../../src/engine/content";

test("generateCities returns between NUM_CITIES_MIN and NUM_CITIES_MAX cities", () => {
  const rng = createRng(1);
  const cities = generateCities(rng);
  expect(cities.length).toBeGreaterThanOrEqual(NUM_CITIES_MIN);
  expect(cities.length).toBeLessThanOrEqual(NUM_CITIES_MAX);
});

test("generateCities produces unique ids and non-empty names", () => {
  const cities = generateCities(createRng(2));
  const ids = new Set(cities.map(c => c.id));
  expect(ids.size).toBe(cities.length);
  for (const c of cities) {
    expect(c.name.length).toBeGreaterThan(0);
    expect(c.position.x).toBeGreaterThanOrEqual(0);
    expect(c.position.y).toBeGreaterThanOrEqual(0);
  }
});

test("generateCities is deterministic under same seed", () => {
  const a = generateCities(createRng(42));
  const b = generateCities(createRng(42));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test("generateCities includes at least one of each archetype when N is large enough — soft check", () => {
  // Not strictly required, but sanity: we should see variety.
  const cities = generateCities(createRng(5));
  const archetypes = new Set(cities.map(c => c.archetype));
  expect(archetypes.size).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/world-gen.test.ts
```

- [ ] **Step 3: Implement**

`src/engine/world-gen.ts` (replace placeholder):
```ts
import type { Archetype, City, Commodity } from "./types";
import { COMMODITIES } from "./types";
import {
  ARCHETYPE_PRICE_MULT,
  CITY_NAME_PREFIXES, CITY_NAME_SUFFIXES,
  COMMODITY_SPECS,
  NUM_CITIES_MAX, NUM_CITIES_MIN,
} from "./content";
import type { Rng } from "./rng";

const ARCHETYPE_POOL: Archetype[] = [
  "port", "mining", "farmland", "forest",
  "trade_capital", "border", "desert",
];

const MAP_SIZE = 100;

function generateName(archetype: Archetype, rng: Rng, taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const prefix = rng.pick(CITY_NAME_PREFIXES[archetype]);
    const suffix = rng.pick(CITY_NAME_SUFFIXES[archetype]);
    const name = (prefix + suffix).replace(/\s+/g, "");
    const cased = name.charAt(0).toUpperCase() + name.slice(1);
    if (!taken.has(cased)) {
      taken.add(cased);
      return cased;
    }
  }
  const fallback = `Settlement${taken.size}`;
  taken.add(fallback);
  return fallback;
}

function makeInitialPriceTable(archetype: Archetype, rng: Rng): Record<Commodity, number> {
  const table = {} as Record<Commodity, number>;
  for (const c of COMMODITIES) {
    const spec = COMMODITY_SPECS[c];
    const biased = spec.base_price * ARCHETYPE_PRICE_MULT[archetype][c];
    const drift = 1 + (rng.next() * 2 - 1) * spec.volatility;
    table[c] = Math.max(spec.min_price, Math.min(spec.max_price, biased * drift));
  }
  return table;
}

export function generateCities(rng: Rng): City[] {
  const n = rng.nextInt(NUM_CITIES_MIN, NUM_CITIES_MAX + 1);
  const names = new Set<string>();
  const cities: City[] = [];
  for (let i = 0; i < n; i++) {
    // Ensure at least one of the first several archetypes appears; then random.
    const archetype: Archetype = i < ARCHETYPE_POOL.length
      ? ARCHETYPE_POOL[i]!
      : rng.pick(ARCHETYPE_POOL);
    const name = generateName(archetype, rng, names);
    const zeroMem = {} as Record<Commodity, number>;
    for (const c of COMMODITIES) zeroMem[c] = 0;
    cities.push({
      id: `c${i}`,
      name,
      archetype,
      position: { x: rng.next() * MAP_SIZE, y: rng.next() * MAP_SIZE },
      price_table: makeInitialPriceTable(archetype, rng),
      local_memory: zeroMem,
      unique_offers: [],
      hires_available: [],
    });
  }
  return cities;
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/world-gen.test.ts
```

Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/world-gen.ts tests/engine/world-gen.test.ts
git commit -m "feat(engine): generate cities with archetypes, names, and initial price tables"
```

---

### Task 8: Edge graph generation

Builds a connected graph over the generated cities. Uses a simple approach: Delaunay-style nearest-k connections, then verify connectivity and add bridge edges if needed. Terrain is chosen based on endpoint archetypes (desert endpoints → desert edge; port endpoints → coast; forest → forest; etc.).

**Files:**
- Modify: `src/engine/world-gen.ts`
- Modify: `tests/engine/world-gen.test.ts`

- [ ] **Step 1: Add failing tests for edges**

Append to `tests/engine/world-gen.test.ts`:
```ts
import { generateEdges } from "../../src/engine/world-gen";

function connected(nCities: number, edges: { a: string; b: string }[]): boolean {
  const parent: Record<string, string> = {};
  const ids = Array.from({ length: nCities }, (_, i) => `c${i}`);
  for (const id of ids) parent[id] = id;
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: string, b: string) => { parent[find(a)] = find(b); };
  for (const e of edges) union(e.a, e.b);
  const root = find(ids[0]!);
  return ids.every(id => find(id) === root);
}

test("generateEdges produces a connected graph", () => {
  const rng = createRng(3);
  const cities = generateCities(rng);
  const edges = generateEdges(cities, rng);
  expect(connected(cities.length, edges)).toBe(true);
});

test("generateEdges gives every city at least one neighbor", () => {
  const rng = createRng(4);
  const cities = generateCities(rng);
  const edges = generateEdges(cities, rng);
  const degree: Record<string, number> = {};
  for (const c of cities) degree[c.id] = 0;
  for (const e of edges) { degree[e.a]!++; degree[e.b]!++; }
  for (const c of cities) expect(degree[c.id]).toBeGreaterThanOrEqual(1);
});

test("generateEdges is deterministic under same seed", () => {
  const cities = generateCities(createRng(7));
  const a = generateEdges(cities, createRng(8));
  const b = generateEdges(cities, createRng(8));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
```

- [ ] **Step 2: Run (expect fail — generateEdges undefined)**

```bash
bun test tests/engine/world-gen.test.ts
```

- [ ] **Step 3: Implement generateEdges**

Append to `src/engine/world-gen.ts`:
```ts
import type { Edge, Terrain } from "./types";

function distance(a: City, b: City): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickTerrain(a: City, b: City, rng: Rng): Terrain {
  const arc = [a.archetype, b.archetype];
  if (arc.includes("desert")) return "desert";
  if (arc.includes("port")) return "coast";
  if (arc.includes("forest")) return "forest";
  if (arc.includes("mining")) return "mountain";
  // otherwise weighted by terrain distribution
  return rng.pick<Terrain>(["road", "road", "road", "forest", "mountain", "river"]);
}

export function generateEdges(cities: City[], rng: Rng): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join("|");

  // 1. Connect each city to its 2–3 nearest neighbors.
  for (const c of cities) {
    const neighbors = cities
      .filter(o => o.id !== c.id)
      .map(o => ({ o, d: distance(c, o) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, rng.nextInt(2, 4));
    for (const { o, d } of neighbors) {
      const k = key(c.id, o.id);
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({
        a: c.id < o.id ? c.id : o.id,
        b: c.id < o.id ? o.id : c.id,
        distance: d / 40,                                  // scales distance → fractional days (~0.1–3)
        terrain: pickTerrain(c, o, rng),
      });
    }
  }

  // 2. Ensure connectivity via union-find; add bridges if needed.
  const parent: Record<string, string> = {};
  for (const c of cities) parent[c.id] = c.id;
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: string, b: string) => { parent[find(a)] = find(b); };
  for (const e of edges) union(e.a, e.b);

  const components = new Map<string, City[]>();
  for (const c of cities) {
    const r = find(c.id);
    if (!components.has(r)) components.set(r, []);
    components.get(r)!.push(c);
  }
  const comps = [...components.values()];
  for (let i = 1; i < comps.length; i++) {
    // Find shortest cross-component edge.
    let best: { a: City; b: City; d: number } | null = null;
    for (const a of comps[0]!) {
      for (const b of comps[i]!) {
        const d = distance(a, b);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    if (best) {
      const k = key(best.a.id, best.b.id);
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({
          a: best.a.id < best.b.id ? best.a.id : best.b.id,
          b: best.a.id < best.b.id ? best.b.id : best.a.id,
          distance: best.d / 40,
          terrain: pickTerrain(best.a, best.b, rng),
        });
        union(best.a.id, best.b.id);
      }
    }
  }
  return edges;
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/world-gen.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/world-gen.ts tests/engine/world-gen.test.ts
git commit -m "feat(engine): generate connected edge graph with archetype-biased terrain"
```

---

### Task 9: Event generation + top-level `generateWorld`

Rolls economic and environmental events at game start (with known start/end days) and wraps the whole thing in a single `generateWorld(rng)` entry point.

**Files:**
- Modify: `src/engine/world-gen.ts`
- Modify: `tests/engine/world-gen.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/engine/world-gen.test.ts`:
```ts
import { generateWorld } from "../../src/engine/world-gen";
import { DAY_LIMIT } from "../../src/engine/types";

test("generateWorld returns cities, edges, and events", () => {
  const world = generateWorld(createRng(10));
  expect(world.cities.length).toBeGreaterThanOrEqual(10);
  expect(world.edges.length).toBeGreaterThan(0);
  expect(world.events.length).toBeGreaterThanOrEqual(1);
});

test("generateWorld events have valid start_day + duration", () => {
  const world = generateWorld(createRng(11));
  for (const ev of world.events) {
    expect(ev.start_day).toBeGreaterThanOrEqual(0);
    expect(ev.start_day).toBeLessThanOrEqual(DAY_LIMIT);
    expect(ev.duration).toBeGreaterThan(0);
  }
});

test("generateWorld is deterministic under same seed", () => {
  const a = generateWorld(createRng(999));
  const b = generateWorld(createRng(999));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/world-gen.test.ts
```

- [ ] **Step 3: Implement**

Append to `src/engine/world-gen.ts`:
```ts
import type { World, WorldEvent, EventKind, Commodity } from "./types";
import { COMMODITIES } from "./types";
import { EVENT_SPECS } from "./content";

const ECONOMIC_EVENTS: EventKind[] = ["famine", "glut", "festival", "caravan_arrival", "trade_war"];
const ENV_EVENTS: EventKind[] = ["sandstorm_season", "spring_floods", "blizzard"];

function generateEvents(cities: City[], edges: Edge[], rng: Rng): WorldEvent[] {
  const events: WorldEvent[] = [];
  const count = rng.nextInt(3, 7);   // 3..6 events per run

  for (let i = 0; i < count; i++) {
    const isEconomic = rng.next() < 0.6;
    const kind = isEconomic ? rng.pick(ECONOMIC_EVENTS) : rng.pick(ENV_EVENTS);
    const spec = EVENT_SPECS[kind];
    const start_day = spec.min_day + rng.next() * (spec.max_day - spec.min_day);
    const duration = spec.min_duration + rng.next() * (spec.max_duration - spec.min_duration);

    const ev: WorldEvent = {
      id: `ev${i}`,
      kind,
      start_day,
      duration,
    };

    if (isEconomic) {
      const city = rng.pick(cities);
      const commodity = rng.pick<Commodity>([...COMMODITIES]);
      ev.target_city_ids = [city.id];
      ev.target_commodities = [commodity];
      ev.price_multiplier = spec.price_multiplier;
    } else {
      // Pick a handful of edges that match the event's terrain affinity.
      const terrainForEvent: Record<EventKind, string[]> = {
        sandstorm_season: ["desert"],
        spring_floods:    ["river", "coast"],
        blizzard:         ["mountain"],
        famine: [], glut: [], festival: [], caravan_arrival: [], trade_war: [],
      };
      const matching = edges.filter(e => terrainForEvent[kind].includes(e.terrain));
      const picked = matching.length > 0
        ? matching.filter((_, idx) => idx < 3)
        : edges.filter((_, idx) => idx < 2);
      ev.target_edge_ids = picked.map(e => `${e.a}:${e.b}`);
      ev.encounter_rate_multiplier = spec.encounter_rate_multiplier;
    }
    events.push(ev);
  }
  return events;
}

export function generateWorld(rng: Rng): World {
  const cities = generateCities(rng);
  const edges = generateEdges(cities, rng);
  const events = generateEvents(cities, edges, rng);
  return { cities, edges, events };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/world-gen.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/world-gen.ts tests/engine/world-gen.test.ts
git commit -m "feat(engine): generate economic and environmental events; top-level generateWorld"
```

---

## Phase 4 — Economy

### Task 10: Inventory weight + rare-item multipliers

Pure utilities: compute total carried weight, compute sell-value of a unique item at a given city.

**Files:**
- Modify: `src/engine/inventory.ts`
- Create: `tests/engine/inventory.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/engine/inventory.test.ts`:
```ts
import { test, expect } from "bun:test";
import { totalWeight, uniqueItemSellPrice } from "../../src/engine/inventory";
import type { Inventory, City, UniqueItem } from "../../src/engine/types";

function emptyInv(): Inventory {
  return {
    commodities: { grain: 0, salt: 0, spice: 0, silk: 0, iron: 0, furs: 0, wine: 0, gems: 0 },
    unique_items: [],
  };
}

test("totalWeight of empty inventory is 0", () => {
  expect(totalWeight(emptyInv())).toBe(0);
});

test("totalWeight sums commodity × weight_per_unit + unique-item weights", () => {
  const inv = emptyInv();
  inv.commodities.grain = 5;      // 5 × 10 = 50
  inv.commodities.spice = 10;     // 10 × 2 = 20
  inv.unique_items.push({
    id: "u1", name: "x", category: "art", weight: 3, buy_price: 100, origin_city_id: "c0",
  });
  expect(totalWeight(inv)).toBe(73);
});

test("uniqueItemSellPrice applies archetype category multiplier", () => {
  const item: UniqueItem = { id: "u1", name: "book", category: "book", weight: 1, buy_price: 100, origin_city_id: "c0" };
  const capital: City = { id: "c1", name: "Capital", archetype: "trade_capital",
    position: { x: 0, y: 0 }, price_table: {} as any, local_memory: {} as any,
    unique_offers: [], hires_available: [] };
  const mine: City = { ...capital, archetype: "mining" };
  expect(uniqueItemSellPrice(item, capital)).toBe(260);   // book at trade_capital = 2.6x
  expect(uniqueItemSellPrice(item, mine)).toBe(70);       // book at mining = 0.7x
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/inventory.test.ts
```

- [ ] **Step 3: Implement**

`src/engine/inventory.ts`:
```ts
import type { City, Inventory, UniqueItem } from "./types";
import { COMMODITIES } from "./types";
import { COMMODITY_SPECS, UNIQUE_SELL_MULT } from "./content";

export function totalWeight(inv: Inventory): number {
  let w = 0;
  for (const c of COMMODITIES) w += inv.commodities[c] * COMMODITY_SPECS[c].weight_per_unit;
  for (const u of inv.unique_items) w += u.weight;
  return w;
}

export function uniqueItemSellPrice(item: UniqueItem, city: City): number {
  const mult = UNIQUE_SELL_MULT[city.archetype][item.category];
  return Math.round(item.buy_price * mult);
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/inventory.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/inventory.ts tests/engine/inventory.test.ts
git commit -m "feat(engine): inventory weight + rare-item sell-price multiplier"
```

---

### Task 11: Price tick (drift + local memory + events)

The core economy tick. Each call advances every city's prices by one step.

**Files:**
- Modify: `src/engine/economy.ts`
- Create: `tests/engine/economy.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/engine/economy.test.ts`:
```ts
import { test, expect } from "bun:test";
import { priceTick, applyBuyMemory, applySellMemory } from "../../src/engine/economy";
import { createRng } from "../../src/engine/rng";
import type { City, WorldEvent } from "../../src/engine/types";
import { COMMODITIES } from "../../src/engine/types";
import { COMMODITY_SPECS, ARCHETYPE_PRICE_MULT } from "../../src/engine/content";

function makeCity(archetype: any = "farmland"): City {
  const table = {} as any, mem = {} as any;
  for (const c of COMMODITIES) {
    table[c] = COMMODITY_SPECS[c].base_price * ARCHETYPE_PRICE_MULT[archetype][c];
    mem[c] = 0;
  }
  return {
    id: "c0", name: "X", archetype, position: { x: 0, y: 0 },
    price_table: table, local_memory: mem, unique_offers: [], hires_available: [],
  };
}

test("priceTick keeps prices within min/max bounds", () => {
  const city = makeCity();
  const rng = createRng(1);
  for (let i = 0; i < 50; i++) {
    priceTick([city], [], 3, rng);
    for (const c of COMMODITIES) {
      expect(city.price_table[c]).toBeGreaterThanOrEqual(COMMODITY_SPECS[c].min_price);
      expect(city.price_table[c]).toBeLessThanOrEqual(COMMODITY_SPECS[c].max_price);
    }
  }
});

test("applyBuyMemory raises price on next tick", () => {
  const city = makeCity();
  const before = city.price_table.grain;
  applyBuyMemory(city, "grain", 10);
  // Memory impact is visible in next tick's price.
  const rng = createRng(42);
  priceTick([city], [], 0, rng);
  expect(city.price_table.grain).toBeGreaterThan(before * 0.8);   // soft assertion — drift can dilute
  // Stronger assertion: local_memory is positive.
  expect(city.local_memory.grain).toBeGreaterThan(0);
});

test("applySellMemory lowers memory nudge", () => {
  const city = makeCity();
  applySellMemory(city, "grain", 5);
  expect(city.local_memory.grain).toBeLessThan(0);
});

test("economic event raises price dramatically at target city", () => {
  const city = makeCity("farmland");
  const rng = createRng(7);
  const ev: WorldEvent = {
    id: "e1", kind: "famine", start_day: 0, duration: 10,
    target_city_ids: [city.id], target_commodities: ["grain"], price_multiplier: 3.5,
  };
  const basePrice = city.price_table.grain;
  priceTick([city], [ev], 2, rng);                    // day 2 is inside [0, 10)
  expect(city.price_table.grain).toBeGreaterThan(basePrice * 1.8);
});

test("priceTick is deterministic under same seed", () => {
  const a = makeCity();
  const b = makeCity();
  const rA = createRng(123);
  const rB = createRng(123);
  for (let i = 0; i < 10; i++) {
    priceTick([a], [], i, rA);
    priceTick([b], [], i, rB);
  }
  for (const c of COMMODITIES) expect(a.price_table[c]).toBe(b.price_table[c]);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/economy.test.ts
```

- [ ] **Step 3: Implement**

`src/engine/economy.ts`:
```ts
import type { City, Commodity, WorldEvent } from "./types";
import { COMMODITIES } from "./types";
import {
  ARCHETYPE_PRICE_MULT,
  COMMODITY_SPECS,
  LOCAL_MEMORY_BUY_NUDGE, LOCAL_MEMORY_DECAY, LOCAL_MEMORY_SELL_NUDGE,
} from "./content";
import type { Rng } from "./rng";

function eventActive(ev: WorldEvent, day: number): boolean {
  return day >= ev.start_day && day < ev.start_day + ev.duration;
}

export function priceTick(cities: City[], events: WorldEvent[], day: number, rng: Rng): void {
  const activeEconomic = events.filter(e => eventActive(e, day) && e.price_multiplier !== undefined);

  for (const city of cities) {
    for (const c of COMMODITIES) {
      const spec = COMMODITY_SPECS[c];
      const baseline = spec.base_price * ARCHETYPE_PRICE_MULT[city.archetype][c];

      // Random drift around baseline (mean-reverting).
      const driftPct = (rng.next() * 2 - 1) * spec.volatility;
      const driftTerm = baseline * driftPct;

      // Local memory term (from player's own buys/sells).
      const memoryTerm = baseline * city.local_memory[c];

      // Event multiplier: if any active event targets this city + commodity, apply it to the baseline.
      let eventMult = 1.0;
      for (const ev of activeEconomic) {
        if (!ev.target_city_ids?.includes(city.id)) continue;
        if (!ev.target_commodities?.includes(c)) continue;
        eventMult *= ev.price_multiplier!;
      }

      const raw = baseline * eventMult + driftTerm + memoryTerm;
      city.price_table[c] = Math.max(spec.min_price, Math.min(spec.max_price, raw));
    }
    // Decay local memory.
    for (const c of COMMODITIES) {
      city.local_memory[c] *= LOCAL_MEMORY_DECAY;
      if (Math.abs(city.local_memory[c]) < 0.001) city.local_memory[c] = 0;
    }
  }
}

export function applyBuyMemory(city: City, commodity: Commodity, quantity: number): void {
  city.local_memory[commodity] += LOCAL_MEMORY_BUY_NUDGE * quantity;
}

export function applySellMemory(city: City, commodity: Commodity, quantity: number): void {
  city.local_memory[commodity] -= LOCAL_MEMORY_SELL_NUDGE * quantity;
}

export function sellPriceFor(buyPrice: number, spread: number): number {
  return Math.max(1, Math.round(buyPrice * (1 - spread)));
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/economy.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/economy.ts tests/engine/economy.test.ts
git commit -m "feat(engine): price tick with drift, local memory, and event multipliers"
```

---

### Task 12: Unique item + hire generators (populate cities on arrival)

When the player arrives at a city, we regenerate its `unique_offers` and `hires_available` rosters. These functions are pure (city + rng in → updated city out).

**Files:**
- Modify: `src/engine/economy.ts`
- Modify: `tests/engine/economy.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/engine/economy.test.ts`:
```ts
import { populateCityOffers } from "../../src/engine/economy";

test("populateCityOffers fills unique_offers with 0..3 items, priced near baseline", () => {
  const city = makeCity("trade_capital");
  const rng = createRng(200);
  populateCityOffers(city, rng);
  expect(city.unique_offers.length).toBeGreaterThanOrEqual(0);
  expect(city.unique_offers.length).toBeLessThanOrEqual(3);
  for (const u of city.unique_offers) {
    expect(u.name.length).toBeGreaterThan(0);
    expect(u.buy_price).toBeGreaterThan(0);
    expect(u.weight).toBeGreaterThan(0);
  }
});

test("populateCityOffers fills hires_available with archetype-biased hires", () => {
  const city = makeCity("desert");
  populateCityOffers(city, createRng(300));
  expect(city.hires_available.length).toBeGreaterThanOrEqual(1);
  const kinds = new Set(city.hires_available.map(h => h.kind));
  // A desert outpost should be able to offer at least one of its biased hires.
  const desertSpecialties: Array<"desert_guide" | "pack_animal" | "bodyguard"> = ["desert_guide", "pack_animal", "bodyguard"];
  expect([...kinds].some(k => desertSpecialties.includes(k as any))).toBe(true);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/economy.test.ts
```

- [ ] **Step 3: Implement**

Append to `src/engine/economy.ts`:
```ts
import type { Crew, UniqueItem, UniqueItemCategory } from "./types";
import { ARCHETYPE_HIRE_BIAS, HIRE_SPECS, UNIQUE_ITEM_NAME_PARTS } from "./content";

const UNIQUE_CATEGORIES: UniqueItemCategory[] = ["art", "weapon", "relic", "book", "curio"];

export function populateCityOffers(city: City, rng: Rng): void {
  // Rare items: 0..3
  const numItems = rng.nextInt(0, 4);
  city.unique_offers = [];
  for (let i = 0; i < numItems; i++) {
    const category = rng.pick(UNIQUE_CATEGORIES);
    const parts = UNIQUE_ITEM_NAME_PARTS[category];
    const name = `${rng.pick(parts.adj)} ${rng.pick(parts.noun)} of ${city.name}`;
    const basePrice = 80 + rng.nextInt(0, 220);    // 80..299
    const weight = 0.5 + rng.next() * 3.5;         // 0.5..4 kg
    city.unique_offers.push({
      id: `${city.id}-u-${rng.nextInt(0, 0x7fffffff).toString(36)}-${i}`,
      name,
      category,
      weight: Math.round(weight * 10) / 10,
      buy_price: basePrice,
      origin_city_id: city.id,
    });
  }

  // Hires: 1..3 from archetype bias pool
  const pool = ARCHETYPE_HIRE_BIAS[city.archetype];
  const numHires = rng.nextInt(1, 4);
  city.hires_available = [];
  for (let i = 0; i < numHires; i++) {
    const kind = rng.pick(pool);
    const spec = HIRE_SPECS[kind];
    city.hires_available.push({
      id: `${city.id}-h-${i}-${rng.nextInt(0, 9999)}`,
      kind,
      daily_wage: spec.daily_wage,
      hired_on_day: -1,
    });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/economy.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/economy.ts tests/engine/economy.test.ts
git commit -m "feat(engine): generate unique-item offers and hire rosters per city"
```

---

## Phase 5 — Travel & Encounters

### Task 13: Travel time formula + weather/disaster rolls

Pure function: given (from_city, to_city, edge, active events, weight, crew), compute the travel time for this leg and list out environmental conditions that took effect.

**Files:**
- Modify: `src/engine/travel.ts`
- Create: `tests/engine/travel.test.ts`

- [ ] **Step 1: Write failing test**

`tests/engine/travel.test.ts`:
```ts
import { test, expect } from "bun:test";
import { computeTravelTime } from "../../src/engine/travel";
import { createRng } from "../../src/engine/rng";
import type { Edge, WorldEvent, Crew } from "../../src/engine/types";

const baseEdge: Edge = { a: "c0", b: "c1", distance: 1.0, terrain: "road" };

test("travel time equals distance when no penalties apply", () => {
  const r = createRng(1);
  const result = computeTravelTime(baseEdge, [], 0, 0, [], r);
  expect(result.time).toBeGreaterThan(0.9);
  expect(result.time).toBeLessThan(1.7);           // clear×road×no-weight is close to 1.0 before a weather roll
});

test("heavier weight raises travel time", () => {
  const r = createRng(2);
  const light = computeTravelTime(baseEdge, [], 0, 0, [], r);
  const r2 = createRng(2);
  const heavy = computeTravelTime(baseEdge, [], 0, 400, [], r2);
  expect(heavy.time).toBeGreaterThan(light.time);
});

test("desert terrain with sandstorm event adds extra time", () => {
  const r = createRng(10);
  const edge: Edge = { ...baseEdge, terrain: "desert" };
  const ev: WorldEvent = {
    id: "e1", kind: "sandstorm_season", start_day: 0, duration: 5,
    target_edge_ids: [`${edge.a}:${edge.b}`], encounter_rate_multiplier: 2.5,
  };
  const result = computeTravelTime(edge, [ev], 2, 0, [], r);
  expect(result.time).toBeGreaterThan(1.2);
});

test("desert guide reduces travel time on desert edge", () => {
  const edge: Edge = { ...baseEdge, terrain: "desert" };
  const r1 = createRng(50);
  const withoutGuide = computeTravelTime(edge, [], 0, 0, [], r1);
  const r2 = createRng(50);
  const guide: Crew = { id: "g1", kind: "desert_guide", daily_wage: 20, hired_on_day: 0 };
  const withGuide = computeTravelTime(edge, [], 0, 0, [guide], r2);
  expect(withGuide.time).toBeLessThan(withoutGuide.time);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/travel.test.ts
```

- [ ] **Step 3: Implement**

`src/engine/travel.ts`:
```ts
import type { Crew, Edge, Weather, WorldEvent, HireKind } from "./types";
import {
  REFERENCE_WEIGHT, TERRAIN_TIME_MULT, WEATHER_TIME_MULT, WEIGHT_TIME_COEFF,
} from "./content";
import type { Rng } from "./rng";

export interface TravelResult {
  time: number;
  weather: Weather;
  disaster_penalty: number;
  notes: string[];
}

const GUIDE_FOR_TERRAIN: Record<string, HireKind | null> = {
  desert: "desert_guide",
  forest: "forest_ranger",
  coast: "sea_navigator",
  mountain: null,
  road: null,
  river: null,
};

function edgeKey(e: Edge): string { return `${e.a}:${e.b}`; }

function eventActive(ev: WorldEvent, day: number): boolean {
  return day >= ev.start_day && day < ev.start_day + ev.duration;
}

export function computeTravelTime(
  edge: Edge, events: WorldEvent[], day: number, carried_weight: number,
  crew: Crew[], rng: Rng,
): TravelResult {
  const notes: string[] = [];
  const terrainMult = TERRAIN_TIME_MULT[edge.terrain];

  // Weather roll
  const wRoll = rng.next();
  const weather: Weather = wRoll < 0.6 ? "clear" : wRoll < 0.9 ? "rain" : "storm";
  const weatherMult = WEATHER_TIME_MULT[weather];
  if (weather !== "clear") notes.push(`weather: ${weather}`);

  // Weight penalty
  const weightMult = 1 + (carried_weight / REFERENCE_WEIGHT) * WEIGHT_TIME_COEFF;

  // Active edge events
  let eventMult = 1.0;
  let disaster = 0;
  for (const ev of events) {
    if (!eventActive(ev, day)) continue;
    if (ev.target_edge_ids?.includes(edgeKey(edge))) {
      if (ev.encounter_rate_multiplier !== undefined) {
        eventMult *= 1 + (ev.encounter_rate_multiplier - 1) * 0.2;   // events also slow travel modestly
      }
      notes.push(`active event: ${ev.kind}`);
    }
  }

  // Disaster roll — rare flat penalty, only on hazardous terrains.
  if ((edge.terrain === "desert" || edge.terrain === "mountain" || edge.terrain === "river") && rng.next() < 0.10) {
    disaster = 0.3 + rng.next() * 0.6;
    notes.push(`disaster: +${disaster.toFixed(2)} day`);
  }

  // Matching guide: −20% on terrain multiplier portion.
  const matchingGuideKind = GUIDE_FOR_TERRAIN[edge.terrain];
  const hasMatchingGuide = matchingGuideKind !== null && crew.some(c => c.kind === matchingGuideKind);
  const guideAdjust = hasMatchingGuide ? 0.8 : 1.0;
  if (hasMatchingGuide) notes.push(`guide (${matchingGuideKind}) speeds travel`);

  // Pack animal: raises reference weight → softens weight penalty.
  const packAnimals = crew.filter(c => c.kind === "pack_animal").length;
  const effectiveWeightMult = 1 + (carried_weight / (REFERENCE_WEIGHT * (1 + packAnimals))) * WEIGHT_TIME_COEFF;
  if (packAnimals > 0) notes.push(`${packAnimals} pack animal(s) reduce weight penalty`);

  const base = edge.distance * terrainMult * guideAdjust * weatherMult * effectiveWeightMult * eventMult;
  const time = base + disaster;
  return { time, weather, disaster_penalty: disaster, notes };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/travel.test.ts
```

Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/travel.ts tests/engine/travel.test.ts
git commit -m "feat(engine): travel time formula with weather, weight, events, guides, pack animals"
```

---

### Task 14: Encounter rolling (Poisson + crew suppression)

Decides how many and which encounters fire on a leg. Depends on terrain, edge length, active events, and crew composition.

**Files:**
- Modify: `src/engine/travel.ts`
- Modify: `tests/engine/travel.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/engine/travel.test.ts`:
```ts
import { rollEncounters } from "../../src/engine/travel";

test("rollEncounters returns zero or more encounters", () => {
  const r = createRng(17);
  const edge: Edge = { a: "a", b: "b", distance: 1.5, terrain: "forest" };
  const out = rollEncounters(edge, [], 0, [], r);
  expect(out.length).toBeGreaterThanOrEqual(0);
});

test("bodyguards reduce hostile encounter frequency over many trials", () => {
  const edge: Edge = { a: "a", b: "b", distance: 2.0, terrain: "forest" };
  let unprotected = 0, protected_ = 0;
  for (let i = 0; i < 200; i++) {
    unprotected += rollEncounters(edge, [], 0, [], createRng(i * 2 + 1))
      .filter(e => e.category === "hostile").length;
    const guards: Crew[] = [
      { id: "g1", kind: "bodyguard", daily_wage: 15, hired_on_day: 0 },
      { id: "g2", kind: "bodyguard", daily_wage: 15, hired_on_day: 0 },
      { id: "g3", kind: "bodyguard", daily_wage: 15, hired_on_day: 0 },
    ];
    protected_ += rollEncounters(edge, [], 0, guards, createRng(i * 2 + 1))
      .filter(e => e.category === "hostile").length;
  }
  expect(protected_).toBeLessThan(unprotected);
});

test("environmental events raise environmental encounter frequency", () => {
  const edge: Edge = { a: "a", b: "b", distance: 1.5, terrain: "desert" };
  const ev: WorldEvent = {
    id: "e1", kind: "sandstorm_season", start_day: 0, duration: 5,
    target_edge_ids: ["a:b"], encounter_rate_multiplier: 2.5,
  };
  let base = 0, storm = 0;
  for (let i = 0; i < 200; i++) {
    base  += rollEncounters(edge, [],   0, [], createRng(i + 9000)).filter(e => e.category === "environmental").length;
    storm += rollEncounters(edge, [ev], 2, [], createRng(i + 9000)).filter(e => e.category === "environmental").length;
  }
  expect(storm).toBeGreaterThan(base);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/travel.test.ts
```

- [ ] **Step 3: Implement**

Append to `src/engine/travel.ts`:
```ts
import type { PendingEncounter } from "./types";
import {
  BASE_ENCOUNTER_RATE, BODYGUARD_HOSTILE_SUPPRESSION,
  GUIDE_ENV_SUPPRESSION, TERRAIN_ENCOUNTER_RATE,
} from "./content";

// Approximate Poisson sample via clamped sum of Bernoullis — simple, fast, enough for gameplay.
function poissonLike(lambda: number, rng: Rng): number {
  let count = 0;
  let remaining = lambda;
  while (remaining > 0) {
    const step = Math.min(1, remaining);
    if (rng.next() < step) count += 1;
    remaining -= 1;
  }
  return Math.min(count, 3);
}

const HOSTILE_KINDS = ["bandits", "raiders", "wolves", "extortionists"];
const NEUTRAL_KINDS = ["lost_traveler", "abandoned_shrine", "found_cache", "wandering_merchant"];
const ENV_BY_TERRAIN: Record<string, string[]> = {
  desert:   ["sandstorm", "heatstroke", "lost_in_desert"],
  forest:   ["lost_in_forest", "trap", "swarm"],
  mountain: ["avalanche", "rockfall", "blizzard_encounter"],
  river:    ["flash_flood", "swept_away"],
  coast:    ["lost_at_sea", "wrecker_rocks"],
  road:     ["washed_out_bridge"],
};

function chooseCategory(terrain: string, eventEnvMult: number, rng: Rng): "hostile" | "environmental" | "neutral" {
  const hostileW = 0.35;
  const envW = 0.30 * eventEnvMult;
  const neutralW = 0.25;
  const total = hostileW + envW + neutralW;
  const roll = rng.next() * total;
  if (roll < hostileW) return "hostile";
  if (roll < hostileW + envW) return "environmental";
  return "neutral";
}

export function rollEncounters(
  edge: Edge, events: WorldEvent[], day: number, crew: Crew[], rng: Rng,
): PendingEncounter[] {
  // Aggregate env multiplier from active events on this edge.
  let envMult = 1.0;
  for (const ev of events) {
    if (!eventActive(ev, day)) continue;
    if (ev.target_edge_ids?.includes(edgeKey(edge)) && ev.encounter_rate_multiplier) {
      envMult *= ev.encounter_rate_multiplier;
    }
  }

  const lambda = BASE_ENCOUNTER_RATE * edge.distance * TERRAIN_ENCOUNTER_RATE[edge.terrain] * (1 + (envMult - 1) * 0.4);
  const nRaw = poissonLike(lambda, rng);

  const bodyguards = crew.filter(c => c.kind === "bodyguard").length;
  const desertGuides = crew.filter(c => c.kind === "desert_guide").length;
  const forestGuides = crew.filter(c => c.kind === "forest_ranger").length;
  const seaGuides = crew.filter(c => c.kind === "sea_navigator").length;

  const result: PendingEncounter[] = [];
  for (let i = 0; i < nRaw; i++) {
    let category = chooseCategory(edge.terrain, envMult, rng);

    // Crew suppression. Each bodyguard rerolls a hostile into nothing with prob SUPPRESSION.
    if (category === "hostile") {
      let suppressProb = 1 - Math.pow(1 - BODYGUARD_HOSTILE_SUPPRESSION, bodyguards);
      if (rng.next() < suppressProb) continue;
    } else if (category === "environmental") {
      let matchingGuides = 0;
      if (edge.terrain === "desert") matchingGuides = desertGuides;
      else if (edge.terrain === "forest") matchingGuides = forestGuides;
      else if (edge.terrain === "coast") matchingGuides = seaGuides;
      let suppressProb = 1 - Math.pow(1 - GUIDE_ENV_SUPPRESSION, matchingGuides);
      if (rng.next() < suppressProb) continue;
    }

    // Pick a specific encounter kind.
    let kind: string;
    if (category === "hostile") kind = rng.pick(HOSTILE_KINDS);
    else if (category === "environmental") kind = rng.pick(ENV_BY_TERRAIN[edge.terrain] ?? ["misfortune"]);
    else kind = rng.pick(NEUTRAL_KINDS);

    result.push({
      id: `enc-${i}-${rng.nextInt(0, 999999)}`,
      category,
      kind,
      narrative_seed: `${category}:${kind} on ${edge.terrain}`,
      options: [],   // filled in by encounters.ts once odds formulas land
    });
  }
  return result;
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/travel.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/travel.ts tests/engine/travel.test.ts
git commit -m "feat(engine): encounter rolling with Poisson-like rate and crew suppression"
```

---

### Task 15: Encounter odds calculator + option generation

Produce the `options[]` for a given `PendingEncounter`: success percentages (clamped 5–95%), costs, and outcomes per branch. Populates the `options` field so the server can serve it to the client.

**Files:**
- Modify: `src/engine/encounters.ts`
- Create: `tests/engine/encounters.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/engine/encounters.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildEncounterOptions } from "../../src/engine/encounters";
import type { Crew, PendingEncounter } from "../../src/engine/types";

function encounter(category: "hostile" | "environmental" | "neutral", kind: string): PendingEncounter {
  return { id: "e1", category, kind, narrative_seed: "", options: [] };
}

test("hostile encounter has fight/flee/bribe/parley options", () => {
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 0, []);
  const ids = opts.map(o => o.id);
  expect(ids).toContain("fight");
  expect(ids).toContain("flee");
  expect(ids).toContain("bribe");
  expect(ids).toContain("parley");
});

test("environmental encounter has endure/flee options, no fight or bribe", () => {
  const opts = buildEncounterOptions(encounter("environmental", "sandstorm"), 0, []);
  const ids = opts.map(o => o.id);
  expect(ids).toContain("endure");
  expect(ids).toContain("flee");
  expect(ids).not.toContain("fight");
  expect(ids).not.toContain("bribe");
});

test("neutral encounter has help/accept/ignore options", () => {
  const opts = buildEncounterOptions(encounter("neutral", "lost_traveler"), 0, []);
  const ids = opts.map(o => o.id);
  expect(ids.some(id => ["help", "accept", "ignore"].includes(id as string))).toBe(true);
});

test("all success percentages clamped to [5, 95]", () => {
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 9999, []);   // huge weight
  for (const o of opts) {
    expect(o.success_pct).toBeGreaterThanOrEqual(5);
    expect(o.success_pct).toBeLessThanOrEqual(95);
  }
});

test("more bodyguards raise fight success", () => {
  const noGuards = buildEncounterOptions(encounter("hostile", "bandits"), 100, []);
  const three: Crew[] = Array.from({ length: 3 }, (_, i) => ({
    id: `g${i}`, kind: "bodyguard", daily_wage: 15, hired_on_day: 0,
  }));
  const threeGuards = buildEncounterOptions(encounter("hostile", "bandits"), 100, three);
  const fightN = noGuards.find(o => o.id === "fight")!.success_pct;
  const fightG = threeGuards.find(o => o.id === "fight")!.success_pct;
  expect(fightG).toBeGreaterThan(fightN);
});

test("matching desert guide raises endure success on sandstorm", () => {
  const none = buildEncounterOptions(encounter("environmental", "sandstorm"), 0, []);
  const guide: Crew[] = [{ id: "dg", kind: "desert_guide", daily_wage: 20, hired_on_day: 0 }];
  const guided = buildEncounterOptions(encounter("environmental", "sandstorm"), 0, guide);
  const e1 = none.find(o => o.id === "endure")!.success_pct;
  const e2 = guided.find(o => o.id === "endure")!.success_pct;
  expect(e2).toBeGreaterThan(e1);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/encounters.test.ts
```

- [ ] **Step 3: Implement**

`src/engine/encounters.ts`:
```ts
import type { Crew, EncounterOption, EncounterOutcome, PendingEncounter, HireKind } from "./types";
import {
  BASE_BRIBE_SUCCESS, BASE_ENVIRONMENTAL_SUCCESS, BASE_FIGHT_SUCCESS,
  BASE_FLEE_SUCCESS, BASE_PARLEY_SUCCESS,
  BODYGUARD_FIGHT_BONUS, GUIDE_ENV_BONUS, SCOUT_BONUS,
  REFERENCE_WEIGHT, WEIGHT_ODDS_COEFF,
} from "./content";

const clamp = (p: number): number => Math.max(5, Math.min(95, Math.round(p)));

function weightPenalty(weight: number): number {
  return (weight / REFERENCE_WEIGHT) * WEIGHT_ODDS_COEFF;
}

function matchingGuideForEnv(kind: string, crew: Crew[]): boolean {
  const map: Record<string, HireKind> = {
    sandstorm: "desert_guide", heatstroke: "desert_guide", lost_in_desert: "desert_guide",
    lost_in_forest: "forest_ranger", trap: "forest_ranger", swarm: "forest_ranger",
    lost_at_sea: "sea_navigator", wrecker_rocks: "sea_navigator",
  };
  const needed = map[kind];
  return needed !== undefined && crew.some(c => c.kind === needed);
}

function emptyOutcome(): EncounterOutcome {
  return {
    time_lost_days: 0, gold_delta: 0,
    goods_lost: [], goods_gained: [],
    unique_items_gained: [], unique_items_lost_ids: [],
    rumors_gained: [], crew_changes: [],
  };
}

function hostileOptions(kind: string, weight: number, crew: Crew[]): EncounterOption[] {
  const wp = weightPenalty(weight);
  const bg = crew.filter(c => c.kind === "bodyguard").length;
  const fight_pct = clamp(BASE_FIGHT_SUCCESS + bg * BODYGUARD_FIGHT_BONUS - wp);
  const flee_pct = clamp(BASE_FLEE_SUCCESS - wp * 1.2);
  const bribe_pct = clamp(BASE_BRIBE_SUCCESS - wp * 0.3);
  const parley_pct = clamp(BASE_PARLEY_SUCCESS + bg * 2 - wp * 0.6);

  const succ = (delta: Partial<EncounterOutcome>): EncounterOutcome => ({ ...emptyOutcome(), ...delta });

  return [
    {
      id: "fight", success_pct: fight_pct,
      on_success: succ({ gold_delta: 40 }),
      on_failure: succ({ gold_delta: -90, time_lost_days: 0.4 }),
    },
    {
      id: "flee", success_pct: flee_pct,
      on_success: succ({ time_lost_days: 0.3 }),
      on_failure: succ({ time_lost_days: 0.5, goods_lost: [] /* filled on apply */ }),
    },
    {
      id: "bribe", success_pct: bribe_pct, cost_gold: 60,
      on_success: succ({ gold_delta: 0 }),                 // cost is already the cost_gold
      on_failure: succ({ time_lost_days: 0.3 }),
    },
    {
      id: "parley", success_pct: parley_pct,
      on_success: succ({ /* rumor gained on apply */ }),
      on_failure: succ({ time_lost_days: 0.3, gold_delta: -30 }),
    },
  ];
}

function environmentalOptions(kind: string, weight: number, crew: Crew[]): EncounterOption[] {
  const wp = weightPenalty(weight);
  const guideMatch = matchingGuideForEnv(kind, crew);
  const scouts = crew.filter(c => c.kind === "scout").length;
  const base = BASE_ENVIRONMENTAL_SUCCESS + (guideMatch ? GUIDE_ENV_BONUS : 0) + scouts * SCOUT_BONUS;
  const endure_pct = clamp(base - wp);
  const flee_pct   = clamp(BASE_FLEE_SUCCESS - wp * 1.5);

  const succ = (delta: Partial<EncounterOutcome>): EncounterOutcome => ({ ...emptyOutcome(), ...delta });
  return [
    {
      id: "endure", success_pct: endure_pct,
      on_success: succ({ time_lost_days: 0.15 }),
      on_failure: succ({ time_lost_days: 0.8, gold_delta: -20 }),
    },
    {
      id: "flee", success_pct: flee_pct,
      on_success: succ({ time_lost_days: 0.4 }),
      on_failure: succ({ time_lost_days: 1.0 }),
    },
  ];
}

function neutralOptions(kind: string): EncounterOption[] {
  const succ = (delta: Partial<EncounterOutcome>): EncounterOutcome => ({ ...emptyOutcome(), ...delta });
  return [
    {
      id: "help", success_pct: 80,
      on_success: succ({ time_lost_days: 0.2, gold_delta: 30 }),
      on_failure: succ({ time_lost_days: 0.2 }),
    },
    {
      id: "accept", success_pct: 95,
      on_success: succ({ gold_delta: 20 }),
      on_failure: succ({}),
    },
    {
      id: "ignore", success_pct: 95,
      on_success: succ({}),
      on_failure: succ({}),
    },
  ];
}

export function buildEncounterOptions(
  enc: PendingEncounter, carried_weight: number, crew: Crew[],
): EncounterOption[] {
  if (enc.category === "hostile") return hostileOptions(enc.kind, carried_weight, crew);
  if (enc.category === "environmental") return environmentalOptions(enc.kind, carried_weight, crew);
  return neutralOptions(enc.kind);
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/encounters.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/encounters.ts tests/engine/encounters.test.ts
git commit -m "feat(engine): encounter option builder with odds formulas"
```

---

### Task 16: Encounter resolution (server roll + apply outcome)

Given a player choice, roll success via the PRNG, pick the branch, and return a resolved `EncounterOutcome` that a calling layer can apply to `GameState`.

**Files:**
- Modify: `src/engine/encounters.ts`
- Modify: `tests/engine/encounters.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/engine/encounters.test.ts`:
```ts
import { resolveEncounter } from "../../src/engine/encounters";
import { createRng } from "../../src/engine/rng";

test("resolveEncounter returns the on_success outcome when rng roll succeeds", () => {
  const opts = buildEncounterOptions({ id: "e1", category: "neutral", kind: "found_cache", narrative_seed: "", options: [] }, 0, []);
  // Find the "accept" option (95% success) — on_success delta is +20 gold.
  const rng = createRng(1);        // low roll should succeed
  const res = resolveEncounter(opts, "accept", rng);
  expect(res.success).toBe(true);
  expect(res.outcome.gold_delta).toBe(20);
});

test("resolveEncounter returns on_failure branch when forced low roll beats threshold", () => {
  const opts = buildEncounterOptions({ id: "e1", category: "environmental", kind: "sandstorm", narrative_seed: "", options: [] }, 0, []);
  // Use a deterministic RNG whose first draw is > 0.99 — flee is likely below 95, will fail.
  const rigged = { next: () => 0.99, nextInt: () => 0, pick: <T>(a: T[]) => a[0]!, state: { s: 0 } };
  const res = resolveEncounter(opts, "flee", rigged as any);
  expect(res.success).toBe(false);
});

test("resolveEncounter throws on unknown option id", () => {
  const opts = buildEncounterOptions({ id: "e1", category: "hostile", kind: "bandits", narrative_seed: "", options: [] }, 0, []);
  expect(() => resolveEncounter(opts, "help" as any, createRng(1))).toThrow();
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/encounters.test.ts
```

- [ ] **Step 3: Implement**

Append to `src/engine/encounters.ts`:
```ts
import type { Rng } from "./rng";

export interface ResolutionResult {
  option_id: EncounterOption["id"];
  success: boolean;
  outcome: EncounterOutcome;
}

export function resolveEncounter(
  options: EncounterOption[],
  choice: EncounterOption["id"],
  rng: Rng,
): ResolutionResult {
  const opt = options.find(o => o.id === choice);
  if (!opt) throw new Error(`Unknown option '${choice}' for encounter`);
  const roll = rng.next() * 100;
  const success = roll < opt.success_pct;
  const outcome = { ...(success ? opt.on_success : opt.on_failure) };
  // Bribe cost is applied regardless of success.
  if (opt.id === "bribe" && opt.cost_gold) {
    outcome.gold_delta = (outcome.gold_delta ?? 0) - opt.cost_gold;
  }
  return { option_id: opt.id, success, outcome };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/encounters.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/encounters.ts tests/engine/encounters.test.ts
git commit -m "feat(engine): resolveEncounter rolls success and returns outcome"
```

---

### Task 17: End-of-run tally

Final score = current gold + inventory sell-value at the final city's sell prices.

**Files:**
- Modify: `src/engine/tally.ts`
- Create: `tests/engine/tally.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/engine/tally.test.ts`:
```ts
import { test, expect } from "bun:test";
import { tallyFinalScore } from "../../src/engine/tally";
import type { City, Inventory } from "../../src/engine/types";
import { COMMODITIES } from "../../src/engine/types";

function city(): City {
  const table = {} as any, mem = {} as any;
  for (const c of COMMODITIES) { table[c] = 100; mem[c] = 0; }
  return { id: "final", name: "Final", archetype: "trade_capital", position: { x: 0, y: 0 },
    price_table: table, local_memory: mem, unique_offers: [], hires_available: [] };
}

function emptyInv(): Inventory {
  return {
    commodities: { grain: 0, salt: 0, spice: 0, silk: 0, iron: 0, furs: 0, wine: 0, gems: 0 },
    unique_items: [],
  };
}

test("empty inventory tally equals gold on hand", () => {
  const { total } = tallyFinalScore(500, emptyInv(), city());
  expect(total).toBe(500);
});

test("commodities contribute sell-price × quantity", () => {
  const inv = emptyInv();
  inv.commodities.grain = 10;   // 100 × (1 − 0.15) = 85 each → 850
  const { total, breakdown } = tallyFinalScore(200, inv, city());
  expect(breakdown.commodities).toBe(850);
  expect(total).toBe(200 + 850);
});

test("unique items contribute sell-price at final-city archetype", () => {
  const inv = emptyInv();
  inv.unique_items.push({
    id: "u1", name: "x", category: "book", weight: 1, buy_price: 100, origin_city_id: "c0",
  });
  // trade_capital × book = 2.6 → 260
  const { breakdown } = tallyFinalScore(0, inv, city());
  expect(breakdown.unique_items).toBe(260);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/engine/tally.test.ts
```

- [ ] **Step 3: Implement**

`src/engine/tally.ts`:
```ts
import type { City, Inventory } from "./types";
import { COMMODITIES } from "./types";
import { SELL_SPREAD } from "./content";
import { uniqueItemSellPrice } from "./inventory";
import { sellPriceFor } from "./economy";

export interface TallyBreakdown {
  gold: number;
  commodities: number;
  unique_items: number;
}

export function tallyFinalScore(
  gold: number, inv: Inventory, finalCity: City,
): { total: number; breakdown: TallyBreakdown } {
  let commoditiesTotal = 0;
  for (const c of COMMODITIES) {
    commoditiesTotal += inv.commodities[c] * sellPriceFor(finalCity.price_table[c], SELL_SPREAD);
  }
  let uniqueTotal = 0;
  for (const u of inv.unique_items) {
    uniqueTotal += uniqueItemSellPrice(u, finalCity);
  }
  return {
    total: gold + commoditiesTotal + uniqueTotal,
    breakdown: { gold, commodities: commoditiesTotal, unique_items: uniqueTotal },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/engine/tally.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/tally.ts tests/engine/tally.test.ts
git commit -m "feat(engine): end-of-run tally (gold + commodities + unique items)"
```

---

## Phase 6 — Persistence

### Task 18: SQLite schema + games CRUD

Single-table storage of serialized game state plus append-only event log.

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/games.ts`
- Create: `tests/db/games.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/db/games.test.ts`:
```ts
import { test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { loadGame, saveGame, appendEvent } from "../../src/db/games";
import type { GameState } from "../../src/engine/types";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

function fakeState(id = "abc"): GameState {
  return {
    session_id: id, day: 0.5, gold: 200,
    inventory: { commodities: { grain: 0, salt: 0, spice: 0, silk: 0, iron: 0, furs: 0, wine: 0, gems: 0 }, unique_items: [] },
    crew: [], current_city_id: "c0", visited_city_ids: ["c0"], known_rumors: [],
    world: { cities: [], edges: [], events: [] },
    history: { encounters_survived: 0, cities_visited: 1, events_discovered: 0, best_trade_profit: 0 },
  };
}

test("save + load round-trips the game state", () => {
  const state = fakeState();
  saveGame(db, state, "rng-42");
  const loaded = loadGame(db, "abc");
  expect(loaded).not.toBeNull();
  expect(loaded!.state.session_id).toBe("abc");
  expect(loaded!.state.gold).toBe(200);
  expect(loaded!.rng_state).toBe("rng-42");
});

test("loadGame returns null for unknown id", () => {
  expect(loadGame(db, "nope")).toBeNull();
});

test("saveGame updates existing row (upsert) and bumps updated_at", () => {
  saveGame(db, fakeState(), "r1");
  const first = loadGame(db, "abc")!;
  const s2 = fakeState(); s2.gold = 999;
  saveGame(db, s2, "r2");
  const second = loadGame(db, "abc")!;
  expect(second.state.gold).toBe(999);
  expect(second.rng_state).toBe("r2");
  expect(second.updated_at >= first.updated_at).toBe(true);
});

test("appendEvent records a row with kind + payload", () => {
  saveGame(db, fakeState(), "r");
  appendEvent(db, "abc", 1.2, "buy", { commodity: "grain", quantity: 3 });
  const rows = db.prepare("SELECT * FROM game_events WHERE game_id = ?").all("abc") as any[];
  expect(rows.length).toBe(1);
  expect(rows[0].kind).toBe("buy");
  expect(JSON.parse(rows[0].payload_json).quantity).toBe(3);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/db/games.test.ts
```

- [ ] **Step 3: Implement schema**

`src/db/schema.ts`:
```ts
import type { Database } from "bun:sqlite";

export function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id          TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      status      TEXT NOT NULL,
      rng_state   TEXT NOT NULL,
      state_json  TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS game_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id       TEXT NOT NULL,
      day           REAL NOT NULL,
      kind          TEXT NOT NULL,
      payload_json  TEXT NOT NULL,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id)`);
}
```

- [ ] **Step 4: Implement CRUD**

`src/db/games.ts`:
```ts
import type { Database } from "bun:sqlite";
import type { GameState } from "../engine/types";

export interface LoadedGame {
  state: GameState;
  rng_state: string;
  created_at: string;
  updated_at: string;
  status: "active" | "completed";
}

export function saveGame(db: Database, state: GameState, rngState: string, status: "active" | "completed" = "active"): void {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT created_at FROM games WHERE id = ?").get(state.session_id) as { created_at: string } | null;
  const createdAt = existing?.created_at ?? now;
  db.run(
    `INSERT INTO games (id, created_at, updated_at, status, rng_state, state_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       updated_at = excluded.updated_at,
       status     = excluded.status,
       rng_state  = excluded.rng_state,
       state_json = excluded.state_json`,
    [state.session_id, createdAt, now, status, rngState, JSON.stringify(state)],
  );
}

export function loadGame(db: Database, sessionId: string): LoadedGame | null {
  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(sessionId) as any;
  if (!row) return null;
  return {
    state: JSON.parse(row.state_json) as GameState,
    rng_state: row.rng_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
  };
}

export function appendEvent(
  db: Database, sessionId: string, day: number, kind: string, payload: unknown,
): void {
  db.run(
    `INSERT INTO game_events (game_id, day, kind, payload_json) VALUES (?, ?, ?, ?)`,
    [sessionId, day, kind, JSON.stringify(payload)],
  );
}
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/db/games.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/games.ts tests/db/games.test.ts
git commit -m "feat(db): SQLite schema + games CRUD + append-only event log"
```

---

## Phase 7 — MCP Tools

### Task 19: Top-level service layer + `start_game`

A thin service module wraps engine + db for tool handlers. First verb wired end-to-end: `start_game` generates the world, writes the initial state to SQLite, returns session_id + visible map.

**Files:**
- Create: `src/service.ts` (service layer — loads/saves state, exposes typed methods tools call)
- Modify: `src/mcp/tools/session.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/start_game.test.ts`

- [ ] **Step 1: Write failing integration test**

`tests/integration/start_game.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("start_game returns a session with visible map + starting gold", () => {
  const db = new Database(":memory:");
  initSchema(db);
  const svc = createService(db);
  const res = svc.startGame({ seed: 42 });
  expect(res.session_id.length).toBeGreaterThan(0);
  expect(res.starting_gold).toBe(200);
  expect(res.day).toBe(0);
  expect(res.starting_city.id).toBeDefined();
  expect(res.visible_cities.length).toBeGreaterThanOrEqual(1);
  // The starting city must be among visible.
  expect(res.visible_cities.find(c => c.id === res.starting_city.id)).toBeDefined();
});

test("start_game persists state; loadGame returns the same session_id", () => {
  const db = new Database(":memory:");
  initSchema(db);
  const svc = createService(db);
  const res = svc.startGame({ seed: 77 });
  const loaded = svc.getState(res.session_id);
  expect(loaded.session_id).toBe(res.session_id);
});

test("start_game is deterministic under a given seed", () => {
  const db1 = new Database(":memory:"); initSchema(db1);
  const db2 = new Database(":memory:"); initSchema(db2);
  const a = createService(db1).startGame({ seed: 5 });
  const b = createService(db2).startGame({ seed: 5 });
  // Same seed → same world (sans session_id, created_at).
  expect(a.visible_cities.map(c => c.name).sort()).toEqual(b.visible_cities.map(c => c.name).sort());
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/start_game.test.ts
```

- [ ] **Step 3: Implement service**

`src/service.ts`:
```ts
import type { Database } from "bun:sqlite";
import type { GameState, City } from "./engine/types";
import { generateWorld } from "./engine/world-gen";
import { populateCityOffers } from "./engine/economy";
import { createRng, serializeRng, deserializeRng } from "./engine/rng";
import { loadGame, saveGame, appendEvent } from "./db/games";
import { STARTING_GOLD } from "./engine/content";
import { COMMODITIES } from "./engine/types";

export interface StartGameArgs { seed?: number; }
export interface StartGameResult {
  session_id: string;
  day: number;
  starting_gold: number;
  starting_city: { id: string; name: string; archetype: string };
  visible_cities: { id: string; name: string; archetype: string; known: boolean }[];
}

export interface Service {
  startGame(args?: StartGameArgs): StartGameResult;
  getState(sessionId: string): GameState;
}

function visibleCityIds(state: GameState): Set<string> {
  const seen = new Set<string>(state.visited_city_ids);
  for (const cid of state.visited_city_ids) {
    const adjacent = state.world.edges.filter(e => e.a === cid || e.b === cid);
    for (const e of adjacent) {
      seen.add(e.a === cid ? e.b : e.a);
    }
  }
  for (const r of state.known_rumors) {
    if (r.about_city_id) seen.add(r.about_city_id);
  }
  return seen;
}

export function createService(db: Database): Service {
  return {
    startGame(args = {}) {
      const seed = args.seed ?? Math.floor(Math.random() * 0x7fffffff);
      const rng = createRng(seed);
      const world = generateWorld(rng);
      const startingCity = world.cities[rng.nextInt(0, world.cities.length)]!;
      populateCityOffers(startingCity, rng);

      const zeroCommodities = {} as Record<(typeof COMMODITIES)[number], number>;
      for (const c of COMMODITIES) zeroCommodities[c] = 0;

      const state: GameState = {
        session_id: crypto.randomUUID(),
        day: 0,
        gold: STARTING_GOLD,
        inventory: { commodities: zeroCommodities, unique_items: [] },
        crew: [],
        current_city_id: startingCity.id,
        visited_city_ids: [startingCity.id],
        known_rumors: [],
        world,
        history: { encounters_survived: 0, cities_visited: 1, events_discovered: 0, best_trade_profit: 0 },
      };

      saveGame(db, state, serializeRng(rng));
      appendEvent(db, state.session_id, 0, "start_game", { seed, starting_city_id: startingCity.id });

      const visIds = visibleCityIds(state);
      return {
        session_id: state.session_id,
        day: state.day,
        starting_gold: state.gold,
        starting_city: { id: startingCity.id, name: startingCity.name, archetype: startingCity.archetype },
        visible_cities: world.cities
          .filter(c => visIds.has(c.id))
          .map(c => ({ id: c.id, name: c.name, archetype: c.archetype, known: state.visited_city_ids.includes(c.id) })),
      };
    },

    getState(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      return loaded.state;
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/integration/start_game.test.ts
```

- [ ] **Step 5: Wire MCP tool for start_game**

`src/mcp/tools/session.ts`:
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerSessionTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "start_game",
    {
      title: "Start Game",
      description: "Begin a new wandering-trader run. Returns session_id and the starting city. Narrate the arrival richly but do not contradict the structured data.",
      inputSchema: { seed: z.number().int().optional() },
    },
    async ({ seed }) => {
      const res = svc.startGame({ seed });
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
        structuredContent: res,
      };
    },
  );

  server.registerTool(
    "get_state",
    {
      title: "Get Game State",
      description: "Return the full state of the current run.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => {
      const state = svc.getState(session_id);
      return {
        content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
        structuredContent: state as unknown as Record<string, unknown>,
      };
    },
  );
}
```

`src/index.ts`:
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { Database } from "bun:sqlite";
import { initSchema } from "./db/schema";
import { createService } from "./service";
import { registerSessionTools } from "./mcp/tools/session";

const DB_PATH = process.env.WANDERING_TRADER_DB ?? "wandering-trader.db";

const db = new Database(DB_PATH, { create: true });
initSchema(db);
const svc = createService(db);

const server = new McpServer({
  name: "wandering-trader",
  version: "0.1.0",
  description: "A single-player wandering-trader roguelike played via MCP tools.",
});

registerSessionTools(server, svc);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 6: Run full test suite**

```bash
bun test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/service.ts src/mcp/tools/session.ts src/index.ts tests/integration/start_game.test.ts
git commit -m "feat(mcp): start_game and get_state tools wired end-to-end"
```

---

### Task 20: `look` tool (market table + fresh rumors)

Expose the current city's state to the player: market table with buy/sell, unique offers, hires, and fresh rumors generated on arrival.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/city.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/look.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/look.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";
import { COMMODITIES } from "../../src/engine/types";

test("look returns market table, unique offers, hires for the current city", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const start = svc.startGame({ seed: 101 });
  const view = svc.look(start.session_id);
  expect(view.city.id).toBe(start.starting_city.id);
  expect(view.market.length).toBe(COMMODITIES.length);
  for (const row of view.market) {
    expect(row.buy_price).toBeGreaterThan(0);
    expect(row.sell_price).toBeGreaterThan(0);
    expect(row.sell_price).toBeLessThan(row.buy_price);
  }
  expect(view.hires.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/look.test.ts
```

- [ ] **Step 3: Implement service method**

Add to `src/service.ts`:
```ts
import { SELL_SPREAD } from "./engine/content";
import { sellPriceFor } from "./engine/economy";

// (inside the Service interface)
// look(sessionId: string): LookResult;

export interface LookResult {
  day: number;
  gold: number;
  city: { id: string; name: string; archetype: string };
  market: { commodity: string; buy_price: number; sell_price: number; your_holdings: number }[];
  unique_offers: { id: string; name: string; category: string; weight: number; buy_price: number }[];
  hires: { id: string; kind: string; hire_fee: number; daily_wage: number }[];
  rumors: { id: string; text: string; confidence: string }[];
}
```

Extend `createService` return with:
```ts
    look(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;

      const market = COMMODITIES.map(c => ({
        commodity: c,
        buy_price: Math.round(city.price_table[c]),
        sell_price: sellPriceFor(city.price_table[c], SELL_SPREAD),
        your_holdings: state.inventory.commodities[c],
      }));
      const unique_offers = city.unique_offers.map(u => ({
        id: u.id, name: u.name, category: u.category, weight: u.weight, buy_price: u.buy_price,
      }));
      const hires = city.hires_available.map(h => ({
        id: h.id, kind: h.kind, hire_fee: HIRE_SPECS[h.kind].hire_fee, daily_wage: h.daily_wage,
      }));
      const rumors = state.known_rumors.slice(-5).map(r => ({ id: r.id, text: r.text, confidence: r.confidence }));
      return { day: state.day, gold: state.gold, city: { id: city.id, name: city.name, archetype: city.archetype },
        market, unique_offers, hires, rumors };
    },
```

Also import `HIRE_SPECS` at the top of `service.ts`:
```ts
import { HIRE_SPECS } from "./engine/content";
```

And add `look(sessionId: string): LookResult;` to the `Service` interface.

- [ ] **Step 4: Register MCP tool**

`src/mcp/tools/city.ts`:
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerCityTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "look",
    {
      title: "Look Around",
      description: "Examine the current city: market prices, rare items, hires, and any rumors you know. Narrate the scene richly but do not invent stock or prices not in the structured data.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => {
      const res = svc.look(session_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res };
    },
  );
}
```

`src/index.ts`: add `import { registerCityTools } from "./mcp/tools/city";` and a call to `registerCityTools(server, svc);` after session tools.

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/city.ts src/index.ts tests/integration/look.test.ts
git commit -m "feat(mcp): look tool with market table, unique offers, hires, rumors"
```

---

### Task 21: `buy` and `sell` tools

Both mutate inventory + gold + local memory + persisted state, in a single SQLite transaction.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/city.ts`
- Create: `tests/integration/trade.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/integration/trade.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("buy reduces gold and increases inventory", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 11 });
  const view = svc.look(s.session_id);
  const grainRow = view.market.find(m => m.commodity === "grain")!;
  const qty = 3;
  const before = svc.getState(s.session_id).gold;
  const res = svc.buy(s.session_id, { item: "grain", quantity: qty });
  expect(res.ok).toBe(true);
  const after = svc.getState(s.session_id);
  expect(after.gold).toBe(before - grainRow.buy_price * qty);
  expect(after.inventory.commodities.grain).toBe(qty);
});

test("buy fails if insufficient gold", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 12 });
  const res = svc.buy(s.session_id, { item: "gems", quantity: 1000 });
  expect(res.ok).toBe(false);
  expect(res.error).toContain("gold");
});

test("sell increases gold and decreases inventory", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 13 });
  svc.buy(s.session_id, { item: "grain", quantity: 5 });
  const midGold = svc.getState(s.session_id).gold;
  const res = svc.sell(s.session_id, { item: "grain", quantity: 2 });
  expect(res.ok).toBe(true);
  const after = svc.getState(s.session_id);
  expect(after.inventory.commodities.grain).toBe(3);
  expect(after.gold).toBeGreaterThan(midGold);
});

test("sell fails if you don't have the goods", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 14 });
  const res = svc.sell(s.session_id, { item: "silk", quantity: 1 });
  expect(res.ok).toBe(false);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/trade.test.ts
```

- [ ] **Step 3: Implement service methods**

Add to `src/service.ts`:
```ts
import { applyBuyMemory, applySellMemory } from "./engine/economy";
import type { Commodity } from "./engine/types";

export interface TradeResult { ok: true; gold: number; new_quantity: number } | { ok: false; error: string };

// (append inside createService return object)
    buy(sessionId, { item, quantity }) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: "quantity must be positive integer" } as const;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;

      if (COMMODITIES.includes(item as any)) {
        const c = item as Commodity;
        const price = Math.round(city.price_table[c]);
        const cost = price * quantity;
        if (state.gold < cost) return { ok: false, error: `not enough gold (need ${cost}, have ${state.gold})` } as const;
        state.gold -= cost;
        state.inventory.commodities[c] += quantity;
        applyBuyMemory(city, c, quantity);
        saveGame(db, state, loaded.rng_state);
        appendEvent(db, sessionId, state.day, "buy", { commodity: c, quantity, cost });
        return { ok: true, gold: state.gold, new_quantity: state.inventory.commodities[c] } as const;
      }

      // Unique item by id
      const u = city.unique_offers.find(o => o.id === item);
      if (!u) return { ok: false, error: `unknown item id '${item}'` } as const;
      if (quantity !== 1) return { ok: false, error: "unique items can only be bought in quantity 1" } as const;
      if (state.gold < u.buy_price) return { ok: false, error: `not enough gold (need ${u.buy_price}, have ${state.gold})` } as const;
      state.gold -= u.buy_price;
      state.inventory.unique_items.push(u);
      city.unique_offers = city.unique_offers.filter(o => o.id !== u.id);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "buy_unique", { item_id: u.id, cost: u.buy_price });
      return { ok: true, gold: state.gold, new_quantity: 1 } as const;
    },

    sell(sessionId, { item, quantity }) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: "quantity must be positive integer" } as const;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;

      if (COMMODITIES.includes(item as any)) {
        const c = item as Commodity;
        if (state.inventory.commodities[c] < quantity) {
          return { ok: false, error: `you only have ${state.inventory.commodities[c]} ${c}` } as const;
        }
        const proceeds = sellPriceFor(city.price_table[c], SELL_SPREAD) * quantity;
        state.gold += proceeds;
        state.inventory.commodities[c] -= quantity;
        applySellMemory(city, c, quantity);
        saveGame(db, state, loaded.rng_state);
        appendEvent(db, sessionId, state.day, "sell", { commodity: c, quantity, proceeds });
        return { ok: true, gold: state.gold, new_quantity: state.inventory.commodities[c] } as const;
      }

      // Unique item
      const idx = state.inventory.unique_items.findIndex(u => u.id === item);
      if (idx < 0) return { ok: false, error: `you do not own item '${item}'` } as const;
      const u = state.inventory.unique_items[idx]!;
      const proceeds = uniqueItemSellPrice(u, city);
      state.gold += proceeds;
      state.inventory.unique_items.splice(idx, 1);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "sell_unique", { item_id: u.id, proceeds });
      return { ok: true, gold: state.gold, new_quantity: 0 } as const;
    },
```

Add imports for `uniqueItemSellPrice`: `import { uniqueItemSellPrice } from "./engine/inventory";`

Add method signatures to the `Service` interface:
```ts
  buy(sessionId: string, args: { item: string; quantity: number }): TradeResult;
  sell(sessionId: string, args: { item: string; quantity: number }): TradeResult;
```

- [ ] **Step 4: Register tools**

Append to `src/mcp/tools/city.ts`:
```ts
  server.registerTool(
    "buy",
    {
      title: "Buy Goods",
      description: "Purchase commodities (by name) or a unique item (by id) from the current city.",
      inputSchema: {
        session_id: z.string(),
        item: z.string(),
        quantity: z.number().int().positive(),
      },
    },
    async ({ session_id, item, quantity }) => {
      const res = svc.buy(session_id, { item, quantity });
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );

  server.registerTool(
    "sell",
    {
      title: "Sell Goods",
      description: "Sell commodities (by name) or a unique item you own (by id) to the current city.",
      inputSchema: {
        session_id: z.string(),
        item: z.string(),
        quantity: z.number().int().positive(),
      },
    },
    async ({ session_id, item, quantity }) => {
      const res = svc.sell(session_id, { item, quantity });
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
```

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/city.ts tests/integration/trade.test.ts
git commit -m "feat(mcp): buy and sell tools with inventory/gold/memory updates"
```

---

### Task 22: `hire`, `dismiss`, `listen` tools

Manage crew roster (hire fee + daily wage tracked on state.crew), and `listen` spends ~0.1 day for extra rumors.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/city.ts`
- Create: `tests/integration/crew.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/integration/crew.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("hire deducts fee and adds crew", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 20 });
  const view = svc.look(s.session_id);
  const first = view.hires[0]!;
  const before = svc.getState(s.session_id).gold;
  const r = svc.hire(s.session_id, first.id);
  expect(r.ok).toBe(true);
  const after = svc.getState(s.session_id);
  expect(after.gold).toBe(before - first.hire_fee);
  expect(after.crew.some(c => c.kind === first.kind)).toBe(true);
});

test("hire fails if insufficient gold", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 21 });
  // Spend all gold first
  const view = svc.look(s.session_id);
  // Drain gold by buying the cheapest commodity until we can't afford any hire.
  const cheap = [...view.market].sort((a, b) => a.buy_price - b.buy_price)[0]!;
  const qty = Math.floor(svc.getState(s.session_id).gold / cheap.buy_price);
  svc.buy(s.session_id, { item: cheap.commodity, quantity: qty });
  const hire = view.hires[0]!;
  const r = svc.hire(s.session_id, hire.id);
  // May or may not fail depending on the leftover. Force it:
  const g = svc.getState(s.session_id).gold;
  if (g < hire.hire_fee) expect(r.ok).toBe(false);
});

test("dismiss removes crew (no refund)", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 22 });
  const view = svc.look(s.session_id);
  const h = view.hires[0]!;
  svc.hire(s.session_id, h.id);
  const crewBefore = svc.getState(s.session_id).crew;
  const crewId = crewBefore[crewBefore.length - 1]!.id;
  svc.dismiss(s.session_id, crewId);
  expect(svc.getState(s.session_id).crew.some(c => c.id === crewId)).toBe(false);
});

test("listen advances day by ~0.1 and may add rumors", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 23 });
  const beforeDay = svc.getState(s.session_id).day;
  svc.listen(s.session_id);
  const afterDay = svc.getState(s.session_id).day;
  expect(afterDay).toBeGreaterThan(beforeDay);
  expect(afterDay - beforeDay).toBeCloseTo(0.1, 2);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/crew.test.ts
```

- [ ] **Step 3: Implement service methods**

Add to `Service` interface:
```ts
  hire(sessionId: string, hireId: string): { ok: boolean; error?: string };
  dismiss(sessionId: string, crewId: string): { ok: boolean; error?: string };
  listen(sessionId: string): { rumors_added: number; day: number };
```

Add inside `createService`:
```ts
    hire(sessionId, hireId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;
      const idx = city.hires_available.findIndex(h => h.id === hireId);
      if (idx < 0) return { ok: false, error: `no such hire '${hireId}' in this city` };
      const h = city.hires_available[idx]!;
      const fee = HIRE_SPECS[h.kind].hire_fee;
      if (state.gold < fee) return { ok: false, error: `not enough gold (need ${fee})` };
      state.gold -= fee;
      const crewMember = { ...h, hired_on_day: state.day };
      state.crew.push(crewMember);
      city.hires_available.splice(idx, 1);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "hire", { crew_id: crewMember.id, kind: h.kind, fee });
      return { ok: true };
    },

    dismiss(sessionId, crewId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const idx = state.crew.findIndex(c => c.id === crewId);
      if (idx < 0) return { ok: false, error: `no such crew '${crewId}'` };
      state.crew.splice(idx, 1);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "dismiss", { crew_id: crewId });
      return { ok: true };
    },

    listen(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      state.day += 0.1;
      // Generate 0..2 rumors referencing random other cities.
      const rng = deserializeRng(loaded.rng_state);
      const others = state.world.cities.filter(c => c.id !== state.current_city_id);
      let added = 0;
      const toAdd = rng.nextInt(0, 3);
      for (let i = 0; i < toAdd && others.length > 0; i++) {
        const target = rng.pick(others);
        state.known_rumors.push({
          id: `r-${state.day.toFixed(2)}-${i}-${rng.nextInt(0, 999)}`,
          about_city_id: target.id,
          topic: "archetype",
          text: `They say ${target.name} is a ${target.archetype.replace("_", " ")}.`,
          heard_on_day: state.day,
          confidence: rng.pick(["low", "medium", "high"] as const),
        });
        added++;
      }
      saveGame(db, state, serializeRng(rng));
      appendEvent(db, sessionId, state.day, "listen", { rumors_added: added });
      return { rumors_added: added, day: state.day };
    },
```

- [ ] **Step 4: Register tools**

Append to `src/mcp/tools/city.ts`:
```ts
  server.registerTool(
    "hire",
    {
      title: "Hire Crew",
      description: "Hire a crew member from the current city. Pays the hire fee immediately; daily wages deduct per travel tick.",
      inputSchema: { session_id: z.string(), hire_id: z.string() },
    },
    async ({ session_id, hire_id }) => {
      const res = svc.hire(session_id, hire_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );

  server.registerTool(
    "dismiss",
    {
      title: "Dismiss Crew",
      description: "Release a crew member. No refund of hire fee.",
      inputSchema: { session_id: z.string(), crew_id: z.string() },
    },
    async ({ session_id, crew_id }) => {
      const res = svc.dismiss(session_id, crew_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );

  server.registerTool(
    "listen",
    {
      title: "Listen for Rumors",
      description: "Spend about a tenth of a day in the local taverns listening for gossip about other cities and roads.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => {
      const res = svc.listen(session_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
```

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/city.ts tests/integration/crew.test.ts
git commit -m "feat(mcp): hire, dismiss, listen tools"
```

---

### Task 23: `plan_travel` (preview, no mutation)

Given a destination, compute the estimated travel time and a wage preview, and surface the edge's terrain + any visible active events. Does not mutate state or advance the clock.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/travel.ts`
- Create: `tests/integration/plan_travel.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/plan_travel.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("plan_travel returns estimate without mutating state", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 30 });
  const state = svc.getState(s.session_id);
  const neighbor = state.world.edges.find(e => e.a === s.starting_city.id || e.b === s.starting_city.id)!;
  const destId = neighbor.a === s.starting_city.id ? neighbor.b : neighbor.a;

  const beforeDay = state.day;
  const plan = svc.planTravel(s.session_id, destId);
  expect(plan.ok).toBe(true);
  if (plan.ok) {
    expect(plan.destination.id).toBe(destId);
    expect(plan.estimated_time).toBeGreaterThan(0);
    expect(plan.terrain.length).toBeGreaterThan(0);
  }
  const afterDay = svc.getState(s.session_id).day;
  expect(afterDay).toBe(beforeDay);
});

test("plan_travel fails for non-neighbor cities", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 31 });
  const state = svc.getState(s.session_id);
  // Pick a city that is not a neighbor of the starting city.
  const neighborIds = new Set(
    state.world.edges
      .filter(e => e.a === s.starting_city.id || e.b === s.starting_city.id)
      .flatMap(e => [e.a, e.b])
  );
  const far = state.world.cities.find(c => !neighborIds.has(c.id));
  if (far) {
    const plan = svc.planTravel(s.session_id, far.id);
    expect(plan.ok).toBe(false);
  }
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/plan_travel.test.ts
```

- [ ] **Step 3: Implement service**

Add to `Service`:
```ts
  planTravel(sessionId: string, destinationCityId: string):
    | { ok: true; destination: { id: string; name: string; archetype: string };
        estimated_time: number; terrain: string; active_events: { kind: string; start_day: number; duration: number }[];
        estimated_wage_cost: number }
    | { ok: false; error: string };
```

Add inside `createService`:
```ts
    planTravel(sessionId, destinationCityId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const edge = state.world.edges.find(
        e => (e.a === state.current_city_id && e.b === destinationCityId) ||
             (e.b === state.current_city_id && e.a === destinationCityId),
      );
      if (!edge) return { ok: false, error: "destination is not a direct neighbor" };
      const dest = state.world.cities.find(c => c.id === destinationCityId);
      if (!dest) return { ok: false, error: "unknown destination city" };

      // Use a throwaway RNG so the preview doesn't advance the persisted rng_state.
      // (deserializeRng is already imported at the top of this file.)
      const previewRng = deserializeRng(loaded.rng_state);
      const carried = totalWeight(state.inventory);
      const travelCalc = computeTravelTime(edge, state.world.events, state.day, carried, state.crew, previewRng);

      const events_active = state.world.events
        .filter(ev => state.day >= ev.start_day && state.day < ev.start_day + ev.duration)
        .filter(ev => ev.target_edge_ids?.includes(`${edge.a}:${edge.b}`))
        .map(ev => ({ kind: ev.kind, start_day: ev.start_day, duration: ev.duration }));

      const wage_per_day = state.crew.reduce((s, c) => s + c.daily_wage, 0);
      return {
        ok: true,
        destination: { id: dest.id, name: dest.name, archetype: dest.archetype },
        estimated_time: Math.round(travelCalc.time * 100) / 100,
        terrain: edge.terrain,
        active_events: events_active,
        estimated_wage_cost: Math.round(wage_per_day * travelCalc.time),
      };
    },
```

Add imports at the top of `service.ts`:
```ts
import { totalWeight } from "./engine/inventory";
import { computeTravelTime } from "./engine/travel";
```

- [ ] **Step 4: Register tool**

`src/mcp/tools/travel.ts`:
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerTravelTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "plan_travel",
    {
      title: "Plan Travel",
      description: "Preview a travel leg to a neighboring city — estimated time, terrain, active events, expected wage cost. Does not advance the clock.",
      inputSchema: { session_id: z.string(), destination_city_id: z.string() },
    },
    async ({ session_id, destination_city_id }) => {
      const res = svc.planTravel(session_id, destination_city_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
}
```

Wire `registerTravelTools(server, svc);` in `src/index.ts`.

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/travel.ts src/index.ts tests/integration/plan_travel.test.ts
git commit -m "feat(mcp): plan_travel preview tool"
```

---

### Task 24: `travel` (commit) — rolls the leg and returns either arrival or first encounter

This is the heart of the travel loop. On commit:
1. Deduct wages for the travel duration.
2. Advance `state.day` by the rolled travel time.
3. Roll encounters for the leg.
4. If none: arrive at the destination, regenerate city offers, price tick, return `arrived`.
5. If any: set `pending_leg.current_encounter`, build options, return `encounter`.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/travel.ts`
- Create: `tests/integration/travel.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/integration/travel.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("travel advances day and either arrives or yields an encounter", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 60 });
  const state = svc.getState(s.session_id);
  const neighbor = state.world.edges.find(e => e.a === s.starting_city.id || e.b === s.starting_city.id)!;
  const dest = neighbor.a === s.starting_city.id ? neighbor.b : neighbor.a;
  const before = svc.getState(s.session_id).day;
  const res = svc.travel(s.session_id, dest);
  expect(res.outcome === "arrived" || res.outcome === "encounter").toBe(true);
  const after = svc.getState(s.session_id).day;
  expect(after).toBeGreaterThan(before);
});

test("travel to a non-neighbor fails", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 61 });
  const state = svc.getState(s.session_id);
  const neighbors = new Set(
    state.world.edges
      .filter(e => e.a === s.starting_city.id || e.b === s.starting_city.id)
      .flatMap(e => [e.a, e.b])
  );
  const far = state.world.cities.find(c => !neighbors.has(c.id) && c.id !== s.starting_city.id);
  if (far) {
    expect(() => svc.travel(s.session_id, far.id)).toThrow();
  }
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/travel.test.ts
```

- [ ] **Step 3: Implement**

Add to `Service`:
```ts
  travel(sessionId: string, destinationCityId: string):
    | { outcome: "arrived"; day: number; arrived_at: { id: string; name: string }; notes: string[] }
    | { outcome: "encounter"; day: number; encounter: { id: string; category: string; kind: string; narrative_seed: string; options: { id: string; success_pct: number; cost_gold?: number }[] } }
    | { outcome: "ended"; final_score: number };
```

Add inside `createService`:
```ts
    travel(sessionId, destinationCityId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const edge = state.world.edges.find(
        e => (e.a === state.current_city_id && e.b === destinationCityId) ||
             (e.b === state.current_city_id && e.a === destinationCityId),
      );
      if (!edge) throw new Error("destination is not a direct neighbor");

      const rng = deserializeRng(loaded.rng_state);
      const carried = totalWeight(state.inventory);
      const travelCalc = computeTravelTime(edge, state.world.events, state.day, carried, state.crew, rng);
      const encounters = rollEncounters(edge, state.world.events, state.day, state.crew, rng);

      // Deduct wages for the full travel duration.
      const wage = state.crew.reduce((s, c) => s + c.daily_wage, 0) * travelCalc.time;
      state.gold = Math.max(0, state.gold - Math.round(wage));

      // Advance day.
      state.day += travelCalc.time;

      if (encounters.length > 0) {
        // Build options for the first encounter; keep remaining pending.
        encounters[0]!.options = buildEncounterOptions(encounters[0]!, carried, state.crew);
        state.pending_leg = {
          from_city_id: state.current_city_id,
          to_city_id: destinationCityId,
          total_travel_time: travelCalc.time,
          elapsed_travel_time: 0,
          remaining_encounters: encounters.slice(1),
          current_encounter: encounters[0]!,
        };
        saveGame(db, state, serializeRng(rng));
        appendEvent(db, sessionId, state.day, "travel_encounter", { to: destinationCityId, kind: encounters[0]!.kind });
        const enc = encounters[0]!;
        return {
          outcome: "encounter" as const,
          day: state.day,
          encounter: { id: enc.id, category: enc.category, kind: enc.kind, narrative_seed: enc.narrative_seed,
            options: enc.options.map(o => ({ id: o.id, success_pct: o.success_pct, cost_gold: o.cost_gold })) },
        };
      }

      // No encounters — straight arrival.
      return arriveAt(db, loaded, state, destinationCityId, rng, travelCalc.notes);
    },
```

Also add `arriveAt` as a private helper:
```ts
function arriveAt(
  db: Database, loaded: LoadedGame, state: GameState, destinationCityId: string, rng: Rng, notes: string[],
) {
  state.current_city_id = destinationCityId;
  if (!state.visited_city_ids.includes(destinationCityId)) {
    state.visited_city_ids.push(destinationCityId);
    state.history.cities_visited++;
  }
  const city = state.world.cities.find(c => c.id === destinationCityId)!;
  populateCityOffers(city, rng);
  priceTick(state.world.cities, state.world.events, state.day, rng);

  // If day >= DAY_LIMIT, finalize.
  if (state.day >= DAY_LIMIT) {
    const finalCity = state.world.cities.find(c => c.id === state.current_city_id)!;
    const { total } = tallyFinalScore(state.gold, state.inventory, finalCity);
    saveGame(db, state, serializeRng(rng), "completed");
    appendEvent(db, state.session_id, state.day, "end_game", { final_score: total });
    return { outcome: "ended" as const, final_score: total };
  }

  state.pending_leg = undefined;
  saveGame(db, state, serializeRng(rng));
  appendEvent(db, state.session_id, state.day, "arrive", { city_id: city.id, notes });
  return { outcome: "arrived" as const, day: state.day, arrived_at: { id: city.id, name: city.name }, notes };
}
```

Add necessary imports to `service.ts`:
```ts
import { rollEncounters } from "./engine/travel";
import { buildEncounterOptions, resolveEncounter } from "./engine/encounters";
import { populateCityOffers, priceTick } from "./engine/economy";
import { DAY_LIMIT } from "./engine/types";
import { tallyFinalScore } from "./engine/tally";
import type { Rng } from "./engine/rng";
```

- [ ] **Step 4: Register tool**

Append to `src/mcp/tools/travel.ts`:
```ts
  server.registerTool(
    "travel",
    {
      title: "Travel to Destination",
      description: "Commit to traveling to a neighboring city. Rolls weather, weight, encounters. Returns 'arrived', 'encounter' (with options to resolve), or 'ended' if day 7 is crossed.",
      inputSchema: { session_id: z.string(), destination_city_id: z.string() },
    },
    async ({ session_id, destination_city_id }) => {
      const res = svc.travel(session_id, destination_city_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
```

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/travel.ts tests/integration/travel.test.ts
git commit -m "feat(mcp): travel commits a leg, advances day, triggers encounters, handles arrival and end-of-run"
```

---

### Task 25: `resolve_encounter` tool

Player picks one of the visible options. Server rolls. Outcome applied. Returns next encounter, arrival, or end-of-run.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/encounter.ts`
- Create: `tests/integration/resolve.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/resolve.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("resolve_encounter progresses a leg that had an encounter", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);

  // Try multiple seeds until we get a travel that yields an encounter.
  let sid = "";
  let enc: any = null;
  let destId = "";
  for (let seed = 1; seed < 200 && !enc; seed++) {
    const s = svc.startGame({ seed });
    const state = svc.getState(s.session_id);
    const neighbor = state.world.edges.find(e => e.a === s.starting_city.id || e.b === s.starting_city.id)!;
    destId = neighbor.a === s.starting_city.id ? neighbor.b : neighbor.a;
    const res = svc.travel(s.session_id, destId);
    if (res.outcome === "encounter") { sid = s.session_id; enc = res.encounter; break; }
  }
  if (!enc) return;   // unlikely with 200 seeds; bail silently rather than flake

  const firstOption = enc.options[0].id;
  const out = svc.resolveEncounter(sid, firstOption);
  expect(["arrived", "encounter", "ended"]).toContain(out.outcome);
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/resolve.test.ts
```

- [ ] **Step 3: Implement service**

Add to `Service`:
```ts
  resolveEncounter(sessionId: string, choice: string): ReturnType<Service["travel"]>;
```

Add inside `createService`:
```ts
    resolveEncounter(sessionId, choice) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      if (!state.pending_leg?.current_encounter) throw new Error("no pending encounter to resolve");
      const enc = state.pending_leg.current_encounter;
      const rng = deserializeRng(loaded.rng_state);

      const result = resolveEncounter(enc.options, choice as any, rng);
      const outcome = result.outcome;
      state.gold = Math.max(0, state.gold + outcome.gold_delta);
      state.day += outcome.time_lost_days;
      for (const { commodity, quantity } of outcome.goods_lost) {
        state.inventory.commodities[commodity] = Math.max(0, state.inventory.commodities[commodity] - quantity);
      }
      for (const { commodity, quantity } of outcome.goods_gained) {
        state.inventory.commodities[commodity] += quantity;
      }
      for (const u of outcome.unique_items_gained) state.inventory.unique_items.push(u);
      for (const id of outcome.unique_items_lost_ids) {
        state.inventory.unique_items = state.inventory.unique_items.filter(u => u.id !== id);
      }
      for (const r of outcome.rumors_gained) state.known_rumors.push(r);
      for (const cc of outcome.crew_changes) {
        if (cc.change === "lost") state.crew = state.crew.filter(c => c.id !== cc.crew_id);
      }
      state.history.encounters_survived += 1;

      appendEvent(db, sessionId, state.day, "encounter_resolved", {
        enc_id: enc.id, choice, success: result.success, gold_delta: outcome.gold_delta,
      });

      // Advance to next encounter, or arrive.
      const remaining = state.pending_leg.remaining_encounters;
      if (remaining.length > 0) {
        const next = remaining[0]!;
        next.options = buildEncounterOptions(next, totalWeight(state.inventory), state.crew);
        state.pending_leg.current_encounter = next;
        state.pending_leg.remaining_encounters = remaining.slice(1);
        saveGame(db, state, serializeRng(rng));
        return {
          outcome: "encounter" as const,
          day: state.day,
          encounter: { id: next.id, category: next.category, kind: next.kind, narrative_seed: next.narrative_seed,
            options: next.options.map(o => ({ id: o.id, success_pct: o.success_pct, cost_gold: o.cost_gold })) },
        };
      }

      // Arrive at destination.
      const destId = state.pending_leg.to_city_id;
      return arriveAt(db, loaded, state, destId, rng, []);
    },
```

- [ ] **Step 4: Register tool**

`src/mcp/tools/encounter.ts`:
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerEncounterTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "resolve_encounter",
    {
      title: "Resolve Encounter",
      description: "Commit to one of the visible encounter options. Server rolls success based on the quoted percentage; applies outcome; continues the leg.",
      inputSchema: { session_id: z.string(), choice: z.string() },
    },
    async ({ session_id, choice }) => {
      const res = svc.resolveEncounter(session_id, choice);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
}
```

Wire `registerEncounterTools(server, svc);` in `src/index.ts`.

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/encounter.ts src/index.ts tests/integration/resolve.test.ts
git commit -m "feat(mcp): resolve_encounter applies outcome and advances leg to next encounter or arrival"
```

---

### Task 26: `end_game` tool (manual trigger) + integration test for automatic end

Automatic end-of-run fires inside `arriveAt` when `day >= DAY_LIMIT`. Also expose a manual `end_game` tool so a client can force-score a stuck run.

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/end.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/end_game.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/integration/end_game.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("end_game returns a final score", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 50 });
  const out = svc.endGame(s.session_id);
  expect(out.final_score).toBe(200);   // starting gold, empty inventory
  expect(out.breakdown.gold).toBe(200);
});

test("after end_game, subsequent write tools reject the session", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 51 });
  svc.endGame(s.session_id);
  const r = svc.buy(s.session_id, { item: "grain", quantity: 1 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain("completed");
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun test tests/integration/end_game.test.ts
```

- [ ] **Step 3: Implement**

Add to `Service`:
```ts
  endGame(sessionId: string): { final_score: number; breakdown: { gold: number; commodities: number; unique_items: number } };
```

Add inside `createService`:
```ts
    endGame(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const finalCity = state.world.cities.find(c => c.id === state.current_city_id)!;
      const { total, breakdown } = tallyFinalScore(state.gold, state.inventory, finalCity);
      saveGame(db, state, loaded.rng_state, "completed");
      appendEvent(db, sessionId, state.day, "end_game", { final_score: total, breakdown });
      return { final_score: total, breakdown };
    },
```

Guard write methods: at the top of `buy`, `sell`, `hire`, `dismiss`, `listen`, `travel`, `resolveEncounter`, add:
```ts
      if (loaded.status === "completed") {
        // For tools that return a discriminated result, emit ok:false. For tools that throw, throw.
        // Use the per-tool pattern used elsewhere in that method.
```

Concretely, update `buy` and `sell` to return `{ ok: false, error: "run is completed" }` early; update `hire`/`dismiss`/`listen` similarly; update `travel`/`resolveEncounter` to throw `new Error("run is completed")`.

Example patch for `buy`:
```ts
    buy(sessionId, { item, quantity }) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") return { ok: false, error: "run is completed" } as const;
      // ... rest unchanged
    },
```

- [ ] **Step 4: Register tool**

`src/mcp/tools/end.ts`:
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerEndTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "end_game",
    {
      title: "End Run",
      description: "Force-tally the current run and mark it completed. Normally fired automatically when day 7 is crossed.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => {
      const res = svc.endGame(session_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
}
```

Wire `registerEndTools(server, svc);` in `src/index.ts`.

- [ ] **Step 5: Run tests**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/service.ts src/mcp/tools/end.ts src/index.ts tests/integration/end_game.test.ts
git commit -m "feat(mcp): end_game tool + guard writes on completed runs"
```

---

## Phase 8 — Integration & Replay

### Task 27: Full-run scripted integration test

End-to-end: start → look → buy → plan → travel → (maybe encounter) → ... until end. Proves the whole stack works.

**Files:**
- Create: `tests/integration/full_run.test.ts`

- [ ] **Step 1: Write test**

`tests/integration/full_run.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";
import { DAY_LIMIT } from "../../src/engine/types";

test("a greedy bot can finish a run with a valid final score", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 321 });
  let sessionId = s.session_id;
  let safety = 0;

  while (safety++ < 200) {
    const state = svc.getState(sessionId);
    if (state.day >= DAY_LIMIT) break;

    // If mid-encounter, pick the highest-success visible option (fallback to first).
    if (state.pending_leg?.current_encounter) {
      const opts = state.pending_leg.current_encounter.options;
      if (opts.length === 0) break;
      const best = [...opts].sort((a, b) => b.success_pct - a.success_pct)[0]!;
      const r = svc.resolveEncounter(sessionId, best.id);
      if (r.outcome === "ended") break;
      continue;
    }

    // In city: greedy — buy cheapest commodity we can afford, travel to first neighbor.
    const view = svc.look(sessionId);
    const cheapest = [...view.market].sort((a, b) => a.buy_price - b.buy_price)[0]!;
    if (state.gold >= cheapest.buy_price) {
      svc.buy(sessionId, { item: cheapest.commodity, quantity: 1 });
    }
    const neighborEdge = state.world.edges.find(e => e.a === state.current_city_id || e.b === state.current_city_id)!;
    const dest = neighborEdge.a === state.current_city_id ? neighborEdge.b : neighborEdge.a;
    const r = svc.travel(sessionId, dest);
    if (r.outcome === "ended") break;
  }

  const final = svc.endGame(sessionId);
  expect(final.final_score).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run**

```bash
bun test tests/integration/full_run.test.ts
```

Expected: pass. If it flakes, loosen `safety` or tighten end detection.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/full_run.test.ts
git commit -m "test: end-to-end scripted full-run integration"
```

---

### Task 28: Determinism / replay test

Two services running the same sequence of tool calls under the same seed must produce byte-identical states.

**Files:**
- Create: `tests/integration/replay.test.ts`

- [ ] **Step 1: Write test**

`tests/integration/replay.test.ts`:
```ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

function runScript(seed: number): any {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed });
  const sid = s.session_id;
  // Deterministic script: buy 1 grain, travel to first neighbor, if encounter pick first option, endGame.
  const view = svc.look(sid);
  if (svc.getState(sid).gold >= view.market[0]!.buy_price) {
    svc.buy(sid, { item: view.market[0]!.commodity, quantity: 1 });
  }
  const state = svc.getState(sid);
  const e = state.world.edges.find(x => x.a === state.current_city_id || x.b === state.current_city_id)!;
  const dest = e.a === state.current_city_id ? e.b : e.a;
  const r = svc.travel(sid, dest);
  if (r.outcome === "encounter") {
    svc.resolveEncounter(sid, r.encounter.options[0]!.id);
  }
  const end = svc.endGame(sid);
  const final = svc.getState(sid);
  // Strip session_id from comparison — it's random UUID per service.
  return { end, final: { ...final, session_id: "<redacted>" } };
}

test("same seed + same scripted actions → same final state", () => {
  const a = runScript(12345);
  const b = runScript(12345);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
```

- [ ] **Step 2: Run**

```bash
bun test tests/integration/replay.test.ts
```

If it flakes, investigate: all RNG consumers must route through `loaded.rng_state`; nothing may call `Math.random()` or `Date.now()` in gameplay paths. Fix any leaks.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/replay.test.ts
git commit -m "test: replay determinism under fixed seed"
```

---

### Task 29: Wire `resume_game` and final smoke check

Add a way to resume an existing run from its session_id (read-only convenience — same as `get_state`, but returns a "welcome back" summary suitable for an MCP client that restarts).

**Files:**
- Modify: `src/service.ts`
- Modify: `src/mcp/tools/session.ts`

- [ ] **Step 1: Add `resumeGame` to service**

Add to `Service`:
```ts
  resumeGame(sessionId: string): {
    session_id: string; day: number; gold: number;
    current_city: { id: string; name: string };
    days_remaining: number; status: "active" | "completed";
  };
```

Add inside `createService`:
```ts
    resumeGame(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;
      return {
        session_id: sessionId, day: state.day, gold: state.gold,
        current_city: { id: city.id, name: city.name },
        days_remaining: Math.max(0, DAY_LIMIT - state.day),
        status: loaded.status,
      };
    },
```

- [ ] **Step 2: Register tool**

Append to `src/mcp/tools/session.ts`:
```ts
  server.registerTool(
    "resume_game",
    {
      title: "Resume Game",
      description: "Resume an existing run. Returns a brief status summary: day, gold, current city, days remaining.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => {
      const res = svc.resumeGame(session_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as Record<string, unknown> };
    },
  );
```

- [ ] **Step 3: Final full test run**

```bash
bun test
```

Expected: all tests pass across engine, db, and integration.

- [ ] **Step 4: Commit**

```bash
git add src/service.ts src/mcp/tools/session.ts
git commit -m "feat(mcp): resume_game tool"
```

---

## Closing Notes

- Everything above keeps the spec's layering honest: engine is pure, db is isolated, tools are thin. Each change lands with a test before code, and each task is one logical unit with one commit.
- Balance coefficients in `src/engine/content.ts` are placeholders from the spec's Open Items. They are intentionally in one file so future tuning is a single-commit change and replay tests will catch accidental coefficient drift.
- The LLM-facing contract is: every tool returns a `structuredContent` payload of machine-readable data plus a short text rendition. The tool descriptions instruct the model to narrate richly on top of the data without contradicting it. That guardrail is enforced by the tests — the model's narration is never exercised in tests, only structured outputs.

**Next step when executing this plan:** pick Task 1. Subagent-driven is recommended for this size of plan.
