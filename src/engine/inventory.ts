import type { City, Inventory, UniqueItem } from "./types";
import { COMMODITIES } from "./types";
import { COMMODITY_SPECS, UNIQUE_SELL_MULT } from "./content";

export function totalWeight(inv: Inventory): number {
  let w = 0;
  for (const c of COMMODITIES) w += inv.commodities[c] * COMMODITY_SPECS[c].weight_per_unit;
  for (const u of inv.unique_items) w += u.weight;
  return w;
}

export function uniqueItemSellPrice(item: UniqueItem, city: City): number {
  const mult = UNIQUE_SELL_MULT[city.archetype][item.category];
  return Math.round(item.buy_price * mult);
}
