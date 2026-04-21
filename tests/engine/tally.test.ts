import { test, expect } from "bun:test";
import { tallyFinalScore } from "../../src/engine/tally";
import type { City, Inventory } from "../../src/engine/types";
import { COMMODITIES } from "../../src/engine/types";

function city(): City {
  const table = {} as any, mem = {} as any;
  for (const c of COMMODITIES) { table[c] = 100; mem[c] = 0; }
  return { id: "final", name: "Final", archetype: "trade_capital", position: { x: 0, y: 0 },
    price_table: table, local_memory: mem, unique_offers: [], hires_available: [] };
}

function emptyInv(): Inventory {
  return {
    commodities: { grain: 0, salt: 0, spice: 0, silk: 0, iron: 0, furs: 0, wine: 0, gems: 0 },
    unique_items: [],
  };
}

test("empty inventory tally equals gold on hand", () => {
  const { total } = tallyFinalScore(500, emptyInv(), city());
  expect(total).toBe(500);
});

test("commodities contribute sell-price × quantity", () => {
  const inv = emptyInv();
  inv.commodities.grain = 10;   // 100 × (1 − 0.15) = 85 each → 850
  const { total, breakdown } = tallyFinalScore(200, inv, city());
  expect(breakdown.commodities).toBe(850);
  expect(total).toBe(200 + 850);
});

test("unique items contribute sell-price at final-city archetype", () => {
  const inv = emptyInv();
  inv.unique_items.push({
    id: "u1", name: "x", category: "book", weight: 1, buy_price: 100, origin_city_id: "c0",
  });
  // trade_capital × book = 2.6 → 260
  const { breakdown } = tallyFinalScore(0, inv, city());
  expect(breakdown.unique_items).toBe(260);
});
