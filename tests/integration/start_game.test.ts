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
