import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";

test("buy reduces gold and increases inventory", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 11 });
  const view = svc.look(s.session_id);
  const grainRow = view.market.find(m => m.commodity === "grain")!;
  const qty = 3;
  const before = svc.getState(s.session_id).gold;
  const res = svc.buy(s.session_id, { item: "grain", quantity: qty });
  expect(res.ok).toBe(true);
  const after = svc.getState(s.session_id);
  expect(after.gold).toBe(before - grainRow.buy_price * qty);
  expect(after.inventory.commodities.grain).toBe(qty);
});

test("buy fails if insufficient gold", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 12 });
  const res = svc.buy(s.session_id, { item: "gems", quantity: 1000 });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error).toContain("gold");
});

test("sell increases gold and decreases inventory", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 13 });
  svc.buy(s.session_id, { item: "grain", quantity: 5 });
  const midGold = svc.getState(s.session_id).gold;
  const res = svc.sell(s.session_id, { item: "grain", quantity: 2 });
  expect(res.ok).toBe(true);
  const after = svc.getState(s.session_id);
  expect(after.inventory.commodities.grain).toBe(3);
  expect(after.gold).toBeGreaterThan(midGold);
});

test("sell fails if you don't have the goods", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const s = svc.startGame({ seed: 14 });
  const res = svc.sell(s.session_id, { item: "silk", quantity: 1 });
  expect(res.ok).toBe(false);
});
