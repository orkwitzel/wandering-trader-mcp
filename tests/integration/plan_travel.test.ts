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
