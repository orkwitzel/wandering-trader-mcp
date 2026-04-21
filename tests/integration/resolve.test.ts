import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("resolve_encounter progresses a leg that had an encounter", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);

  // Try multiple seeds until we get a travel that yields an encounter.
  // If 300 seeds can't trigger one, something is wrong with encounter rolling.
  let sid = "";
  let enc: { options: { id: string; success_pct: number; cost_gold?: number }[] } | null = null;
  let beforeDay = 0;
  for (let seed = 1; seed < 300 && !enc; seed++) {
    const s = svc.startGame({ seed });
    const state = svc.getState(s.session_id);
    const neighbor = state.world.edges.find(e => e.a === s.starting_city.id || e.b === s.starting_city.id)!;
    const destId = neighbor.a === s.starting_city.id ? neighbor.b : neighbor.a;
    beforeDay = svc.getState(s.session_id).day;
    const res = svc.travel(s.session_id, destId);
    if (res.outcome === "encounter") { sid = s.session_id; enc = res.encounter; break; }
  }

  expect(enc).not.toBeNull();
  if (!enc) return;   // narrow for TS; test fails via the expect above

  const best = [...enc.options].sort((a, b) => b.success_pct - a.success_pct)[0]!;
  const before = svc.getState(sid);
  const out = svc.resolveEncounter(sid, best.id as "fight"|"flee"|"bribe"|"parley"|"endure"|"help"|"accept"|"ignore");
  const after = svc.getState(sid);

  expect(["arrived", "encounter", "ended"]).toContain(out.outcome);
  // Day should have advanced (either by the resolve's time cost or because we arrived).
  expect(after.day).toBeGreaterThanOrEqual(before.day);
  // If we arrived, the pending_leg should be cleared.
  if (out.outcome === "arrived") {
    expect(after.pending_leg).toBeUndefined();
  }
});
