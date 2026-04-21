import type { City, Inventory } from "./types";
import { COMMODITIES } from "./types";
import { SELL_SPREAD } from "./content";
import { uniqueItemSellPrice } from "./inventory";
import { sellPriceFor } from "./economy";

export interface TallyBreakdown {
  gold: number;
  commodities: number;
  unique_items: number;
}

export function tallyFinalScore(
  gold: number, inv: Inventory, finalCity: City,
): { total: number; breakdown: TallyBreakdown } {
  let commoditiesTotal = 0;
  for (const c of COMMODITIES) {
    commoditiesTotal += inv.commodities[c] * sellPriceFor(finalCity.price_table[c], SELL_SPREAD);
  }
  let uniqueTotal = 0;
  for (const u of inv.unique_items) {
    uniqueTotal += uniqueItemSellPrice(u, finalCity);
  }
  return {
    total: gold + commoditiesTotal + uniqueTotal,
    breakdown: { gold, commodities: commoditiesTotal, unique_items: uniqueTotal },
  };
}
