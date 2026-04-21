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

test("after end_game, subsequent write tools throw for completed session", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 51 });
  svc.endGame(s.session_id);
  // Per I7: invariant violations (session completed) throw; validation errors return {ok:false}.
  expect(() => svc.buy(s.session_id, { item: "grain", quantity: 1 })).toThrow("run is completed");
});
