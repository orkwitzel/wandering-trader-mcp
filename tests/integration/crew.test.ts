import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("hire deducts fee and adds crew", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 20 });
  const view = svc.look(s.session_id);
  const first = view.hires[0]!;
  const before = svc.getState(s.session_id).gold;
  const r = svc.hire(s.session_id, first.id);
  expect(r.ok).toBe(true);
  const after = svc.getState(s.session_id);
  expect(after.gold).toBe(before - first.hire_fee);
  expect(after.crew.some(c => c.kind === first.kind)).toBe(true);
});

test("hire fails if insufficient gold", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 21 });
  const view = svc.look(s.session_id);
  const hire = view.hires[0]!;
  const cheap = [...view.market].sort((a, b) => a.buy_price - b.buy_price)[0]!;

  // Drain gold until we can't afford the hire fee.
  while (svc.getState(s.session_id).gold >= hire.hire_fee) {
    const gold = svc.getState(s.session_id).gold;
    if (gold < cheap.buy_price) break;
    svc.buy(s.session_id, { item: cheap.commodity, quantity: 1 });
  }

  expect(svc.getState(s.session_id).gold).toBeLessThan(hire.hire_fee);
  const r = svc.hire(s.session_id, hire.id);
  expect(r.ok).toBe(false);
});

test("dismiss removes crew (no refund)", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 22 });
  const view = svc.look(s.session_id);
  const h = view.hires[0]!;
  svc.hire(s.session_id, h.id);
  const crewBefore = svc.getState(s.session_id).crew;
  const crewId = crewBefore[crewBefore.length - 1]!.id;
  svc.dismiss(s.session_id, crewId);
  expect(svc.getState(s.session_id).crew.some(c => c.id === crewId)).toBe(false);
});

test("listen advances day by ~0.1 and may add rumors", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 23 });
  const beforeDay = svc.getState(s.session_id).day;
  svc.listen(s.session_id);
  const afterDay = svc.getState(s.session_id).day;
  expect(afterDay).toBeGreaterThan(beforeDay);
  expect(afterDay - beforeDay).toBeCloseTo(0.1, 2);
});
