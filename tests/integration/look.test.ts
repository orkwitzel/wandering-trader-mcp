import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../src/db/schema";
import { createService } from "../../src/service";
import { COMMODITIES } from "../../src/engine/types";

test("look returns market table, unique offers, hires for the current city", () => {
  const db = new Database(":memory:"); initSchema(db);
  const svc = createService(db);
  const start = svc.startGame({ seed: 101 });
  const view = svc.look(start.session_id);
  expect(view.city.id).toBe(start.starting_city.id);
  expect(view.market.length).toBe(COMMODITIES.length);
  for (const row of view.market) {
    expect(row.buy_price).toBeGreaterThan(0);
    expect(row.sell_price).toBeGreaterThan(0);
    expect(row.sell_price).toBeLessThan(row.buy_price);
  }
  expect(view.hires.length).toBeGreaterThanOrEqual(1);
});
