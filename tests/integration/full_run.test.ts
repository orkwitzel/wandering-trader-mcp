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
  // A functioning run: the loop didn't hit its safety cap, and we got a real score.
  expect(safety).toBeLessThan(200);
  expect(final.final_score).toBeGreaterThan(0);
});
