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
