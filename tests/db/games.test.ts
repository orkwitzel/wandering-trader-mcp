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
    history: { encounters_resolved: 0, cities_visited: 1 },
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
