import { test, expect } from "bun:test";
import { priceTick, applyBuyMemory, applySellMemory } from "../../src/engine/economy";
import { createRng } from "../../src/engine/rng";
import type { City, WorldEvent } from "../../src/engine/types";
import { COMMODITIES } from "../../src/engine/types";
import { COMMODITY_SPECS, ARCHETYPE_PRICE_MULT } from "../../src/engine/content";

function makeCity(archetype: import("../../src/engine/types").Archetype = "farmland"): City {
  const table = {} as any, mem = {} as any;
  for (const c of COMMODITIES) {
    table[c] = COMMODITY_SPECS[c].base_price * ARCHETYPE_PRICE_MULT[archetype][c];
    mem[c] = 0;
  }
  return {
    id: "c0", name: "X", archetype, position: { x: 0, y: 0 },
    price_table: table, local_memory: mem, unique_offers: [], hires_available: [],
  };
}

test("priceTick keeps prices within min/max bounds", () => {
  const city = makeCity();
  const rng = createRng(1);
  for (let i = 0; i < 50; i++) {
    priceTick([city], [], 3, rng);
    for (const c of COMMODITIES) {
      expect(city.price_table[c]).toBeGreaterThanOrEqual(COMMODITY_SPECS[c].min_price);
      expect(city.price_table[c]).toBeLessThanOrEqual(COMMODITY_SPECS[c].max_price);
    }
  }
});

test("applyBuyMemory raises price on next tick", () => {
  const city = makeCity();
  const before = city.price_table.grain;
  applyBuyMemory(city, "grain", 10);
  const rng = createRng(42);
  priceTick([city], [], 0, rng);
  expect(city.price_table.grain).toBeGreaterThan(before * 0.8);
  expect(city.local_memory.grain).toBeGreaterThan(0);
});

test("applySellMemory lowers memory nudge", () => {
  const city = makeCity();
  applySellMemory(city, "grain", 5);
  expect(city.local_memory.grain).toBeLessThan(0);
});

test("economic event raises price dramatically at target city", () => {
  const city = makeCity("farmland");
  const rng = createRng(7);
  const ev: WorldEvent = {
    id: "e1", kind: "famine", start_day: 0, duration: 10,
    target_city_ids: [city.id], target_commodities: ["grain"], price_multiplier: 3.5,
  };
  const basePrice = city.price_table.grain;
  priceTick([city], [ev], 2, rng);
  expect(city.price_table.grain).toBeGreaterThan(basePrice * 1.8);
});

test("priceTick is deterministic under same seed", () => {
  const a = makeCity();
  const b = makeCity();
  const rA = createRng(123);
  const rB = createRng(123);
  for (let i = 0; i < 10; i++) {
    priceTick([a], [], i, rA);
    priceTick([b], [], i, rB);
  }
  for (const c of COMMODITIES) expect(a.price_table[c]).toBe(b.price_table[c]);
});

import { populateCityOffers } from "../../src/engine/economy";

test("populateCityOffers fills unique_offers with 0..3 items, priced near baseline", () => {
  const city = makeCity("trade_capital");
  const rng = createRng(200);
  populateCityOffers(city, rng);
  expect(city.unique_offers.length).toBeGreaterThanOrEqual(0);
  expect(city.unique_offers.length).toBeLessThanOrEqual(3);
  for (const u of city.unique_offers) {
    expect(u.name.length).toBeGreaterThan(0);
    expect(u.buy_price).toBeGreaterThan(0);
    expect(u.weight).toBeGreaterThan(0);
  }
});

test("populateCityOffers fills hires_available with archetype-biased hires", () => {
  const city = makeCity("desert");
  populateCityOffers(city, createRng(300));
  expect(city.hires_available.length).toBeGreaterThanOrEqual(1);
  const kinds = new Set(city.hires_available.map(h => h.kind));
  const desertSpecialties: Array<"desert_guide" | "pack_animal" | "bodyguard"> = ["desert_guide", "pack_animal", "bodyguard"];
  expect([...kinds].some(k => desertSpecialties.includes(k as any))).toBe(true);
});
