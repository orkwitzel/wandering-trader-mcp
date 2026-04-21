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
  if ("outcome" in r && r.outcome === "encounter") {
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
