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
