import { test, expect } from "bun:test";
import { totalWeight, uniqueItemSellPrice } from "../../src/engine/inventory";
import type { Inventory, City, UniqueItem } from "../../src/engine/types";

function emptyInv(): Inventory {
  return {
    commodities: { grain: 0, salt: 0, spice: 0, silk: 0, iron: 0, furs: 0, wine: 0, gems: 0 },
    unique_items: [],
  };
}

test("totalWeight of empty inventory is 0", () => {
  expect(totalWeight(emptyInv())).toBe(0);
});

test("totalWeight sums commodity × weight_per_unit + unique-item weights", () => {
  const inv = emptyInv();
  inv.commodities.grain = 5;
  inv.commodities.spice = 10;
  inv.unique_items.push({
    id: "u1", name: "x", category: "art", weight: 3, buy_price: 100, origin_city_id: "c0",
  });
  expect(totalWeight(inv)).toBe(73);
});

test("uniqueItemSellPrice applies archetype category multiplier", () => {
  const item: UniqueItem = { id: "u1", name: "book", category: "book", weight: 1, buy_price: 100, origin_city_id: "c0" };
  const capital: City = { id: "c1", name: "Capital", archetype: "trade_capital",
    position: { x: 0, y: 0 }, price_table: {} as any, local_memory: {} as any,
    unique_offers: [], hires_available: [] };
  const mine: City = { ...capital, archetype: "mining" };
  expect(uniqueItemSellPrice(item, capital)).toBe(260);
  expect(uniqueItemSellPrice(item, mine)).toBe(70);
});
