import type { City, Commodity, UniqueItemCategory, WorldEvent } from "./types";
import { COMMODITIES } from "./types";
import {
  ARCHETYPE_HIRE_BIAS,
  ARCHETYPE_PRICE_MULT,
  COMMODITY_SPECS,
  HIRE_SPECS,
  LOCAL_MEMORY_BUY_NUDGE, LOCAL_MEMORY_DECAY, LOCAL_MEMORY_SELL_NUDGE,
  UNIQUE_ITEM_NAME_PARTS,
} from "./content";
import type { Rng } from "./rng";

function eventActive(ev: WorldEvent, day: number): boolean {
  return day >= ev.start_day && day < ev.start_day + ev.duration;
}

export function priceTick(cities: City[], events: WorldEvent[], day: number, rng: Rng): void {
  const activeEconomic = events.filter(e => eventActive(e, day) && e.price_multiplier !== undefined);

  for (const city of cities) {
    for (const c of COMMODITIES) {
      const spec = COMMODITY_SPECS[c];
      const baseline = spec.base_price * ARCHETYPE_PRICE_MULT[city.archetype][c];

      const driftPct = (rng.next() * 2 - 1) * spec.volatility;
      const driftTerm = baseline * driftPct;

      const memoryTerm = baseline * city.local_memory[c];

      let eventMult = 1.0;
      for (const ev of activeEconomic) {
        if (!ev.target_city_ids?.includes(city.id)) continue;
        if (!ev.target_commodities?.includes(c)) continue;
        eventMult *= ev.price_multiplier!;
      }

      const raw = baseline * eventMult + driftTerm + memoryTerm;
      city.price_table[c] = Math.max(spec.min_price, Math.min(spec.max_price, raw));
    }
    for (const c of COMMODITIES) {
      city.local_memory[c] *= LOCAL_MEMORY_DECAY;
      if (Math.abs(city.local_memory[c]) < 0.001) city.local_memory[c] = 0;
    }
  }
}

export function applyBuyMemory(city: City, commodity: Commodity, quantity: number): void {
  city.local_memory[commodity] += LOCAL_MEMORY_BUY_NUDGE * quantity;
}

export function applySellMemory(city: City, commodity: Commodity, quantity: number): void {
  city.local_memory[commodity] -= LOCAL_MEMORY_SELL_NUDGE * quantity;
}

export function sellPriceFor(buyPrice: number, spread: number): number {
  return Math.max(1, Math.round(buyPrice * (1 - spread)));
}

const UNIQUE_CATEGORIES: UniqueItemCategory[] = ["art", "weapon", "relic", "book", "curio"];

export function populateCityOffers(city: City, rng: import("./rng").Rng): void {
  // Rare items: 0..3
  const numItems = rng.nextInt(0, 4);
  city.unique_offers = [];
  for (let i = 0; i < numItems; i++) {
    const category = rng.pick(UNIQUE_CATEGORIES);
    const parts = UNIQUE_ITEM_NAME_PARTS[category];
    const name = `${rng.pick(parts.adj)} ${rng.pick(parts.noun)} of ${city.name}`;
    const basePrice = 80 + rng.nextInt(0, 220);
    const weight = 0.5 + rng.next() * 3.5;
    city.unique_offers.push({
      id: `${city.id}-u-${rng.nextInt(0, 0x7fffffff).toString(36)}-${i}`,
      name,
      category,
      weight: Math.round(weight * 10) / 10,
      buy_price: basePrice,
      origin_city_id: city.id,
    });
  }

  // Hires: 1..3
  const pool = ARCHETYPE_HIRE_BIAS[city.archetype];
  const numHires = rng.nextInt(1, 4);
  city.hires_available = [];
  for (let i = 0; i < numHires; i++) {
    const kind = rng.pick(pool);
    const spec = HIRE_SPECS[kind];
    city.hires_available.push({
      id: `${city.id}-h-${i}-${rng.nextInt(0, 9999)}`,
      kind,
      daily_wage: spec.daily_wage,
      hired_on_day: -1,
    });
  }
}
