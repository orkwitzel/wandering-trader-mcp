# Wandering Trader — Design Spec

**Date:** 2026-04-21
**Status:** Design approved, pending spec review
**Stack:** Bun + TypeScript + SQLite (`bun:sqlite`) + `@modelcontextprotocol/sdk`

## 1. Premise

A single-player MCP game. The player is a wandering trader who has seven in-game days to travel a randomly generated region of cities, buying and selling goods at locally varying prices, making opportunistic bets on rare items, and surviving the encounters — hostile, environmental, and neutral — that occur between cities. At the end of day seven the run ends and the player's score is their gold plus the sell-value of any remaining inventory at the final city.

The game is a roguelike run: every session is a new seed, a new map, new events. There is no persistence across runs beyond (optionally) a high-score table.

## 2. Architecture

A stateless MCP server. All game state lives in SQLite keyed by `session_id` (a UUID issued by `start_game`). Every tool takes `session_id` and reads/writes the corresponding row. The LLM narrates on top of structured tool outputs — it never decides mechanics.

**Layering:**
- `src/mcp/` — MCP tool handlers. Thin: parse args, call engine, format response.
- `src/engine/` — pure game logic (world generation, economy tick, encounter resolver, odds calculator, travel-time formula). No I/O. State-in / state-out.
- `src/db/` — SQLite access and migrations.
- `src/engine/content.ts` — static data: commodity list, archetype tables, encounter tables, rumor templates, name-part tables.

**Determinism.** Each game has a seeded PRNG whose state is persisted in SQLite. All randomness (map generation, price drift, encounter rolls, weather) draws from this PRNG. Bugs are reproducible; replay tests are trivial.

## 3. Core Game Loop

```
start_game → [loop until day 7 ends] → end_game (auto-tally)
```

Each iteration the player does one or more of:

1. **Look around** — market prices, unique items, hires for hire, rumors.
2. **Trade** — buy/sell commodities or unique items. Trading is free in time.
3. **Hire / dismiss crew** — bodyguards, scouts, guides, pack animals. Daily wages auto-debit on travel.
4. **Listen** — spend a small time cost (~0.1 day) in taverns to pull additional rumors.
5. **Plan travel** — preview route (time estimate, visible conditions, wage cost, weight penalty). Does not commit.
6. **Travel** — commit. Server rolls the leg. May yield zero or more encounters, then arrival.
7. **Handle encounters** — player picks from an action menu with visible odds; server rolls; LLM narrates outcome.

**Day 0 setup.** `start_game` rolls the world (map, archetypes, events), assigns a starting city, sets starting gold (v1: 200g), and reveals the starting city plus its immediate neighbors.

**Day 7 end.** When the in-game clock crosses day 7 during or after a travel leg, the leg completes, final tally runs at the arriving city, and the run ends. Encounters in progress resolve to completion. Final score = gold on hand + inventory sell-value computed against the final city's **sell prices** (not buy prices).

## 4. World Model

### Map

A connected undirected graph, generated once at `start_game`.

- **Size:** ~10–14 cities per run.
- **Generation:** cities placed in 2D space (for distance math), connected via a relative-neighborhood / Delaunay-ish graph so every city has 2–4 neighbors and no islands are isolated.
- **Edges:** each has a base `distance` (in fractional days) and a `terrain` tag (`road` / `forest` / `mountain` / `river` / `coast` / `desert`). Terrain influences travel time and the encounter table for that edge.

### Cities

Each city has:
- `name` — generated from archetype-biased prefix/suffix tables.
- `archetype` — one of seven (see below).
- `price_table` — current price per commodity, biased by archetype baseline, perturbed by drift + local memory + active events.
- `unique_offers` — 0–3 rare items currently on offer. Regenerated after sufficient in-game time passes.
- `hires_available` — a small rotating roster of hires, archetype-biased.
- `rumors_known` — facts this city "knows" about other cities (archetype, broad price trends, active events, terrain on routes). Rumors have an age and decay in reliability.

### City archetypes

| Archetype | Cheap | Expensive | Flavor bias |
|---|---|---|---|
| Port | spice, silk | grain, iron | foreign hires, sea rumors |
| Mining town | iron, gems | grain, silk, wine | hardy bodyguards |
| Farmland | grain, wine | iron, spice | few unique items |
| Forest settlement | furs, salt | silk, gems | guides, trap-lore rumors |
| Trade capital | all moderate | nothing extreme | scouts, dense rumors |
| Border outpost | variable | variable | risky hires, hazard rumors |
| Desert outpost | salt, gems | grain, wine, furs | camel-drivers/guides, sandstorm rumors; long hazardous edges |

### Rumors

Generated on city arrival and through the `listen` action. Each rumor references a specific other city or route and conveys one of: archetype, price extreme, active or upcoming event, or route terrain/conditions. Rumors carry a confidence (high/medium/low) that reflects age and hop-distance from source.

### Events

Rolled at `start_game` and applied as the clock advances. Two kinds:

- **Economic events** — famines, gluts, festivals, caravan arrivals, trade wars. Apply multiplicative shocks to specific commodities in specific cities for a bounded window.
- **Environmental events** — sandstorm season, spring floods, blizzards. Raise environmental encounter rates and severity on matching edges for a bounded window.

Events exist even if the player never learns about them. Discovering one via rumor or direct observation is a core source of profit.

### Fog of war

The map graph is fully generated. The player sees:
- Visited cities (full data).
- Immediate neighbors of visited cities (name + archetype if seen/rumored; prices and unique items hidden until arrival).
- Cities referenced in known rumors ("heard of, not visited").

## 5. Economy

### Commodities

Eight staples: `grain, salt, spice, silk, iron, furs, wine, gems`. Each has:

- `base_price` — global center of gravity.
- `weight_per_unit` — grain heavy, gems weightless. Drives the soft weight penalty.
- `volatility` — how far prices can drift from baseline per tick.

### Rare unique items

Each city may offer 0–3. An item has:

- `name` — generated, with origin flavor (e.g., "jeweled dagger of Pelaro").
- `weight` — usually low.
- `buy_price` — at this city.
- `category` — `art | weapon | relic | book | curio`. Used with city archetype to determine sell-price multiplier.
- `origin_city` — flavor; surfaces in rumors.

### Price dynamics — the three forces

On every price tick (each time the player arrives at a city), every commodity at every city updates:

```
new_price = clamp(
  base_price                          // archetype baseline for this commodity at this city
  + drift_term                        // bounded random walk per tick
  + local_memory_term                 // your own buy/sell history at THIS city
  + event_multiplier_delta            // active events touching this city or commodity
  , min_price, max_price
)
```

- **Drift:** mean-reverting random walk around archetype baseline. Bounded by volatility. Keeps static arbitrage loops from stabilizing.
- **Local memory:** each unit you buy in a city nudges its price up; each unit you sell nudges it down. Decay is slow (several ticks). Dumping 30 silks in a port will crash its silk price for a while.
- **Events:** time-bounded multiplicative shocks with known start/end days. Discovered through rumors or direct observation.

### Rare items and liquidity

A rare item at its "right" city (category matches archetype preference) sells for 2–4× its buy price. At a "wrong" city, 0.6–0.9×. Rare items are a high-variance bet.

### What the player sees

`look` returns: market table (commodity buy/sell prices with a small spread, your holdings), unique items on offer, hires available, and fresh rumors.

## 6. Travel & Encounters

### Travel time formula

```
travel_time = edge_distance
            × terrain_multiplier        // road 1.0, forest 1.2, mountain 1.5, desert 1.4, river-crossing +0.3 flat
            × weather_multiplier        // clear 1.0, rain 1.2, storm 1.6 (rolled per leg)
            × weight_multiplier         // 1.0 + (carried_weight / reference_weight) × 0.4
                                        //   reference_weight is the baseline cart capacity (tunable; pack animals raise it)
            × event_multiplier          // active events on this edge
            + disaster_penalty          // rare flat additions (sandstorm +0.5 day, washed-out bridge +0.8 day)
```

All inputs are visible via `plan_travel` before the player commits. The real rolls for weather and disasters happen on commit.

### Encounter categories

| Category | Examples | What reduces frequency | What improves odds |
|---|---|---|---|
| Hostile | Bandits, raiders, wolves, extortion | Bodyguards | Bodyguards, weapon items |
| Environmental | Sandstorm, blizzard, flash flood, lost at sea, lost in desert, heatstroke | Matching terrain guide, scouts | Guides, scouts |
| Neutral / opportunity | Lost traveler, abandoned shrine, found cache, wandering merchant | N/A (generally good for the player) | (No social stat in v1) |

**Bodyguards do not help with environmental encounters.** This is the core distinction that makes crew composition a strategic decision.

### Encounter rolls per leg

```
encounter_count ~ Poisson( base_rate × edge_length × terrain_danger × event_surcharge )
```

Each hostile encounter's probability of actually firing is then reduced by bodyguards (e.g., 3 bodyguards ≈ 80% suppression on would-be bandit rolls). Environmental encounters suppressed similarly by matching guides. Neutral encounters are unaffected by crew.

### Encounter resolution — action menu with visible odds

Each encounter returns a narrative hook plus structured options. Example:

```
Encounter: Bandits on the forest road. (3 of them, light-armed)
Your crew: 2 bodyguards.
Your load: 280 kg (medium).

Options:
  [fight]   Success 68%  | On success: +40g loot, 0 days lost
                         | On fail: −90g or 2 random goods, −0.4 day
  [flee]    Success 55%  | On success: −0.3 day (forced detour)
                         | On fail: −1 random good, −0.5 day
  [bribe]   Success 95%  | Costs 60g up front; on rare fail, still lose gold + −0.3 day
  [parley]  Success 40%  | On success: no loss + 1 rumor; on fail: fight triggers at −15% odds
```

### Odds formulas

**Fight:**
```
fight_success = base_fight_success
              + weapon_bonus
              + (bodyguards × 8%)
              − weight_penalty
              ± encounter_type_modifier
clamped to [5%, 95%]
```

**Environmental (e.g., sandstorm survival):**
```
env_success = base_success_for_this_type
            + matching_guide_bonus       // e.g., desert guide +25pp vs sandstorm
            + scout_bonus                // +8pp (early reaction)
            − weight_penalty
            ± severity_modifier
clamped to [5%, 95%]
```

Flee, bribe, parley each have their own formula. All odds computed server-side and included in the encounter payload.

### Outcomes

Returned as a typed `EncounterOutcome`:
- `time_lost_days: number`
- `gold_delta: number`
- `goods_lost: Array<{commodity, quantity}>`
- `goods_gained: Array<{commodity, quantity}>` (plus unique items)
- `rumors_gained: Rumor[]`
- `crew_changes: Array<{crew_id, change}>`

The LLM narrates from this payload; it cannot alter mechanics.

### Multiple encounters per leg

Resolved sequentially. If you lose a bodyguard mid-leg, the next encounter's odds reflect that.

## 7. Crew (Hires)

| Hire type | Effect | Wage |
|---|---|---|
| Bodyguard | ↓ hostile encounter chance; ↑ fight odds | 15g/day |
| Scout | Early warning on all encounter types; +8pp on environmental odds | 10g/day |
| Desert guide | ↑ odds on desert/sandstorm encounters; ↓ desert-edge travel time | 20g/day |
| Sea navigator | Equivalent for coastal/sea edges | 20g/day |
| Forest ranger | Equivalent for forest; reduces "lost" chance | 15g/day |
| Pack animal (camel/mule) | Raises `reference_weight` denominator; reduces effective weight penalty | 8g/day (feed) |

Hire availability is archetype-biased. Wages debit on each travel tick. A hire the player cannot pay leaves at the next arrival.

## 8. MCP Tool Surface

All tools take `session_id`. All responses have a structured `data` object and a short `text` field. The LLM narrates from `data` without contradicting it.

**Session**
- `start_game(difficulty?)` → `{ session_id, starting_city, visible_map, starting_gold, day, ... }`
- `resume_game(session_id)` → full state snapshot
- `get_state(session_id)` → full state snapshot

**In-city**
- `look()` — market table, unique items, hires, fresh rumors
- `buy({ item, quantity })` — validates gold, applies local-memory nudge
- `sell({ item, quantity })` — mirror of buy
- `hire({ hire_id })` / `dismiss({ crew_id })` — manage crew; hire fee paid on hire
- `listen()` — pay ~0.1 day for extra rumors

**Travel**
- `plan_travel({ destination_city })` → preview: estimated time, visible terrain/weather/events, wage cost, weight-penalty breakdown. Does not advance the clock.
- `travel({ destination_city })` → commit. Rolls the leg. Returns `outcome: "arrived"` or `outcome: "encounter"` (with encounter payload and options).

**Encounters**
- `resolve_encounter({ choice })` — player picks one of the visible options. Server rolls; applies outcome. Returns next encounter, or arrival, or end-of-run.

**Run end**
- `end_game(session_id)` — auto-fired on day-7 crossing after leg completes. Returns final tally: gold on hand, inventory sell-value at final city, grand total, run summary.

### Principles

- **Idempotent on read, transactional on write.** SQLite transaction per mutation, with PRNG state advanced atomically.
- **Preview vs commit separation.** `plan_travel` never mutates. Players never pay for hidden costs.
- **Structured + narrative dual output.** Every response has machine-readable `data` and a terse `text` block.
- **No mutation from LLM invention.** If the structured payload doesn't contain it, it doesn't exist.

## 9. State Schema

### SQLite

```sql
CREATE TABLE games (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  status      TEXT NOT NULL,          -- 'active' | 'completed'
  rng_state   TEXT NOT NULL,          -- serialized PRNG state
  state_json  TEXT NOT NULL           -- full GameState blob
);

CREATE TABLE game_events (            -- append-only log for debugging + replay
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      TEXT NOT NULL,
  day          REAL NOT NULL,
  kind         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);
```

### GameState blob (TypeScript sketch)

```ts
interface GameState {
  day: number;                 // 0.0 → 7.0, fractional
  gold: number;
  inventory: Inventory;        // commodities + unique_items
  crew: Crew[];
  current_city_id: string;
  visited_cities: Set<string>;
  known_rumors: Rumor[];       // with age + confidence
  world: World;                // map, cities, edges, events
  pending_leg?: PendingLeg;    // if mid-travel-with-encounter
  history: {
    encounters_resolved: number;
    cities_visited: number;
  };
}

interface World {
  cities: City[];
  edges: Edge[];
  events: WorldEvent[];        // economic + environmental
  prng: string;                // also mirrored in games.rng_state
}
```

## 10. Test Strategy

### Unit tests (engine layer, heaviest coverage)

Run via `bun test`. Pure functions with seeded RNG:

- Map generation: determinism under seed, connectivity, archetype distribution.
- Price tick: drift bounds, local-memory nudge correctness, event multiplier application.
- Odds calculator: weight penalty scaling, bodyguard contribution, guide/terrain matching, clamp behavior.
- Encounter resolver: outcome application (gold/goods/time deltas), sequential resolution on a leg.
- Travel time formula: each multiplier in isolation and combined.
- End-of-run tally: gold + inventory sell-value.

### Property-based tests

For price tick and odds calculator: fuzz inputs and assert invariants (odds always in [5%, 95%], prices in `[min_price, max_price]`, weight never negative).

### Integration tests (tool layer)

In-process MCP server, call tools through the SDK, assert on structured outputs:

- Full run script end-to-end; verify final tally matches expected.
- Replay test: given a seed + a recorded sequence of tool calls, output is byte-identical across runs.

### Out of scope

LLM narration quality. Only structured `data` payloads are guaranteed.

## 11. Open Items for the Implementation Plan

These are tuning details that belong in the implementation plan, not this design:

- Exact starting gold, base prices, weight-per-unit, and volatility per commodity.
- Exact archetype price biases (the matrix in §4 is qualitative).
- Exact coefficient values in the odds and travel-time formulas.
- Encounter table populations (how many of each category, relative weights).
- Rumor template library.
- Name-part tables for city name generation.
- Rare-item category × archetype sell-multiplier matrix.
- Event generation rates and severity distributions.
- PRNG choice (likely a `mulberry32` or `xoshiro128**` — small, fast, trivially serializable).

## 12. Non-Goals (v1)

- Multiplayer, leaderboards (beyond optional local high-score), cross-run progression.
- Social/charisma stat and associated encounter options.
- Condition/HP bar (explicitly rejected in favor of time + goods loss).
- Voluntary retirement (run length is fixed at 7 days).
- LLM-authored mechanics of any kind. The LLM narrates; it does not decide.
