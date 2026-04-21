import type { Database } from "bun:sqlite";
import type { GameState } from "./engine/types";
import { COMMODITIES, DAY_LIMIT } from "./engine/types";
import type { Commodity, EncounterOption } from "./engine/types";
import type { Rng } from "./engine/rng";
import { generateWorld } from "./engine/world-gen";
import { populateCityOffers, priceTick, sellPriceFor, applyBuyMemory, applySellMemory } from "./engine/economy";
import { createRng, serializeRng, deserializeRng } from "./engine/rng";
import { loadGame, saveGame, appendEvent } from "./db/games";
import type { LoadedGame } from "./db/games";
import { STARTING_GOLD, SELL_SPREAD, HIRE_SPECS } from "./engine/content";
import { totalWeight, uniqueItemSellPrice } from "./engine/inventory";
import { computeTravelTime, rollEncounters } from "./engine/travel";
import { buildEncounterOptions, resolveEncounter } from "./engine/encounters";
import { tallyFinalScore } from "./engine/tally";

export interface StartGameArgs { seed?: number; }
export interface StartGameResult {
  session_id: string;
  day: number;
  starting_gold: number;
  starting_city: { id: string; name: string; archetype: string };
  visible_cities: { id: string; name: string; archetype: string; known: boolean }[];
}

export interface LookResult {
  day: number;
  gold: number;
  city: { id: string; name: string; archetype: string };
  market: { commodity: string; buy_price: number; sell_price: number; your_holdings: number }[];
  unique_offers: { id: string; name: string; category: string; weight: number; buy_price: number }[];
  hires: { id: string; kind: string; hire_fee: number; daily_wage: number }[];
  rumors: { id: string; text: string; confidence: string }[];
}

export type TradeResult = { ok: true; gold: number; new_quantity: number } | { ok: false; error: string };

export interface Service {
  startGame(args?: StartGameArgs): StartGameResult;
  getState(sessionId: string): GameState;
  look(sessionId: string): LookResult;
  buy(sessionId: string, args: { item: string; quantity: number }): TradeResult;
  sell(sessionId: string, args: { item: string; quantity: number }): TradeResult;
  hire(sessionId: string, hireId: string): { ok: boolean; error?: string };
  dismiss(sessionId: string, crewId: string): { ok: boolean; error?: string };
  listen(sessionId: string): { rumors_added: number; day: number };
  planTravel(sessionId: string, destinationCityId: string):
    | { ok: true; destination: { id: string; name: string; archetype: string };
        estimated_time: number; terrain: string; active_events: { kind: string; start_day: number; duration: number }[];
        estimated_wage_cost: number }
    | { ok: false; error: string };
  travel(sessionId: string, destinationCityId: string):
    | { outcome: "arrived"; day: number; arrived_at: { id: string; name: string }; notes: string[] }
    | { outcome: "encounter"; day: number; encounter: { id: string; category: string; kind: string; narrative_seed: string; options: { id: EncounterOption["id"]; success_pct: number; cost_gold?: number }[] } }
    | { outcome: "ended"; final_score: number };
  resolveEncounter(sessionId: string, choice: EncounterOption["id"]): ReturnType<Service["travel"]>;
  endGame(sessionId: string): { final_score: number; breakdown: { gold: number; commodities: number; unique_items: number } };
  resumeGame(sessionId: string): {
    session_id: string; day: number; gold: number;
    current_city: { id: string; name: string };
    days_remaining: number; status: "active" | "completed";
  };
}

function visibleCityIds(state: GameState): Set<string> {
  const seen = new Set<string>(state.visited_city_ids);
  for (const cid of state.visited_city_ids) {
    const adjacent = state.world.edges.filter(e => e.a === cid || e.b === cid);
    for (const e of adjacent) {
      seen.add(e.a === cid ? e.b : e.a);
    }
  }
  for (const r of state.known_rumors) {
    if (r.about_city_id) seen.add(r.about_city_id);
  }
  return seen;
}

function arriveAt(
  db: Database, _loaded: LoadedGame, state: GameState, destinationCityId: string, rng: Rng, notes: string[],
): { outcome: "arrived"; day: number; arrived_at: { id: string; name: string }; notes: string[] }
  | { outcome: "ended"; final_score: number } {
  state.current_city_id = destinationCityId;
  if (!state.visited_city_ids.includes(destinationCityId)) {
    state.visited_city_ids.push(destinationCityId);
    state.history.cities_visited++;
  }
  const city = state.world.cities.find(c => c.id === destinationCityId)!;
  populateCityOffers(city, rng);
  priceTick(state.world.cities, state.world.events, state.day, rng);

  // If day >= DAY_LIMIT, finalize.
  if (state.day >= DAY_LIMIT) {
    state.pending_leg = undefined;
    const finalCity = state.world.cities.find(c => c.id === state.current_city_id)!;
    const { total } = tallyFinalScore(state.gold, state.inventory, finalCity);
    saveGame(db, state, serializeRng(rng), "completed");
    appendEvent(db, state.session_id, state.day, "end_game", { final_score: total });
    return { outcome: "ended" as const, final_score: total };
  }

  state.pending_leg = undefined;
  saveGame(db, state, serializeRng(rng));
  appendEvent(db, state.session_id, state.day, "arrive", { city_id: city.id, notes });
  return { outcome: "arrived" as const, day: state.day, arrived_at: { id: city.id, name: city.name }, notes };
}

export function createService(db: Database): Service {
  return {
    startGame(args = {}) {
      const seed = args.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff);
      const rng = createRng(seed);
      const world = generateWorld(rng);
      const startingCity = world.cities[rng.nextInt(0, world.cities.length)]!;
      populateCityOffers(startingCity, rng);

      const zeroCommodities = {} as Record<(typeof COMMODITIES)[number], number>;
      for (const c of COMMODITIES) zeroCommodities[c] = 0;

      const state: GameState = {
        session_id: crypto.randomUUID(),
        day: 0,
        gold: STARTING_GOLD,
        inventory: { commodities: zeroCommodities, unique_items: [] },
        crew: [],
        current_city_id: startingCity.id,
        visited_city_ids: [startingCity.id],
        known_rumors: [],
        world,
        history: { encounters_survived: 0, cities_visited: 1, events_discovered: 0, best_trade_profit: 0 },
      };

      saveGame(db, state, serializeRng(rng));
      appendEvent(db, state.session_id, 0, "start_game", { seed, starting_city_id: startingCity.id });

      const visIds = visibleCityIds(state);
      return {
        session_id: state.session_id,
        day: state.day,
        starting_gold: state.gold,
        starting_city: { id: startingCity.id, name: startingCity.name, archetype: startingCity.archetype },
        visible_cities: world.cities
          .filter(c => visIds.has(c.id))
          .map(c => ({ id: c.id, name: c.name, archetype: c.archetype, known: state.visited_city_ids.includes(c.id) })),
      };
    },

    getState(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      return loaded.state;
    },

    look(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;

      const market = COMMODITIES.map(c => ({
        commodity: c,
        buy_price: Math.round(city.price_table[c]),
        sell_price: sellPriceFor(city.price_table[c], SELL_SPREAD),
        your_holdings: state.inventory.commodities[c],
      }));
      const unique_offers = city.unique_offers.map(u => ({
        id: u.id, name: u.name, category: u.category, weight: u.weight, buy_price: u.buy_price,
      }));
      const hires = city.hires_available.map(h => ({
        id: h.id, kind: h.kind, hire_fee: HIRE_SPECS[h.kind].hire_fee, daily_wage: h.daily_wage,
      }));
      const rumors = state.known_rumors.slice(-5).map(r => ({ id: r.id, text: r.text, confidence: r.confidence }));
      return {
        day: state.day,
        gold: state.gold,
        city: { id: city.id, name: city.name, archetype: city.archetype },
        market,
        unique_offers,
        hires,
        rumors,
      };
    },

    buy(sessionId, { item, quantity }) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") return { ok: false, error: "run is completed" } as const;
      const state = loaded.state;
      if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: "quantity must be positive integer" } as const;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;

      if (COMMODITIES.includes(item as Commodity)) {
        const c = item as Commodity;
        const price = Math.round(city.price_table[c]);
        const cost = price * quantity;
        if (state.gold < cost) return { ok: false, error: `not enough gold (need ${cost}, have ${state.gold})` } as const;
        state.gold -= cost;
        state.inventory.commodities[c] += quantity;
        applyBuyMemory(city, c, quantity);
        saveGame(db, state, loaded.rng_state);
        appendEvent(db, sessionId, state.day, "buy", { commodity: c, quantity, cost });
        return { ok: true, gold: state.gold, new_quantity: state.inventory.commodities[c] } as const;
      }

      // Unique item by id
      const u = city.unique_offers.find(o => o.id === item);
      if (!u) return { ok: false, error: `unknown item id '${item}'` } as const;
      if (quantity !== 1) return { ok: false, error: "unique items can only be bought in quantity 1" } as const;
      if (state.gold < u.buy_price) return { ok: false, error: `not enough gold (need ${u.buy_price}, have ${state.gold})` } as const;
      state.gold -= u.buy_price;
      state.inventory.unique_items.push(u);
      city.unique_offers = city.unique_offers.filter(o => o.id !== u.id);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "buy_unique", { item_id: u.id, cost: u.buy_price });
      return { ok: true, gold: state.gold, new_quantity: 1 } as const;
    },

    sell(sessionId, { item, quantity }) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") return { ok: false, error: "run is completed" } as const;
      const state = loaded.state;
      if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: "quantity must be positive integer" } as const;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;

      if (COMMODITIES.includes(item as Commodity)) {
        const c = item as Commodity;
        if (state.inventory.commodities[c] < quantity) {
          return { ok: false, error: `you only have ${state.inventory.commodities[c]} ${c}` } as const;
        }
        const proceeds = sellPriceFor(city.price_table[c], SELL_SPREAD) * quantity;
        state.gold += proceeds;
        state.inventory.commodities[c] -= quantity;
        applySellMemory(city, c, quantity);
        saveGame(db, state, loaded.rng_state);
        appendEvent(db, sessionId, state.day, "sell", { commodity: c, quantity, proceeds });
        return { ok: true, gold: state.gold, new_quantity: state.inventory.commodities[c] } as const;
      }

      // Unique item
      const idx = state.inventory.unique_items.findIndex(u => u.id === item);
      if (idx < 0) return { ok: false, error: `you do not own item '${item}'` } as const;
      const u = state.inventory.unique_items[idx]!;
      const proceeds = uniqueItemSellPrice(u, city);
      state.gold += proceeds;
      state.inventory.unique_items.splice(idx, 1);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "sell_unique", { item_id: u.id, proceeds });
      return { ok: true, gold: state.gold, new_quantity: 0 } as const;
    },

    hire(sessionId, hireId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") return { ok: false, error: "run is completed" };
      const state = loaded.state;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;
      const idx = city.hires_available.findIndex(h => h.id === hireId);
      if (idx < 0) return { ok: false, error: `no such hire '${hireId}' in this city` };
      const h = city.hires_available[idx]!;
      const fee = HIRE_SPECS[h.kind].hire_fee;
      if (state.gold < fee) return { ok: false, error: `not enough gold (need ${fee})` };
      state.gold -= fee;
      const crewMember = { ...h, hired_on_day: state.day };
      state.crew.push(crewMember);
      city.hires_available.splice(idx, 1);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "hire", { crew_id: crewMember.id, kind: h.kind, fee });
      return { ok: true };
    },

    dismiss(sessionId, crewId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") return { ok: false, error: "run is completed" };
      const state = loaded.state;
      const idx = state.crew.findIndex(c => c.id === crewId);
      if (idx < 0) return { ok: false, error: `no such crew '${crewId}'` };
      state.crew.splice(idx, 1);
      saveGame(db, state, loaded.rng_state);
      appendEvent(db, sessionId, state.day, "dismiss", { crew_id: crewId });
      return { ok: true };
    },

    listen(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") return { rumors_added: 0, day: loaded.state.day };
      const state = loaded.state;
      state.day += 0.1;
      // Generate 0..2 rumors referencing random other cities.
      const rng = deserializeRng(loaded.rng_state);
      const others = state.world.cities.filter(c => c.id !== state.current_city_id);
      let added = 0;
      const toAdd = rng.nextInt(0, 3);
      for (let i = 0; i < toAdd && others.length > 0; i++) {
        const target = rng.pick(others);
        state.known_rumors.push({
          id: `r-${state.day.toFixed(2)}-${i}-${rng.nextInt(0, 999)}`,
          about_city_id: target.id,
          topic: "archetype",
          text: `They say ${target.name} is a ${target.archetype.replace("_", " ")}.`,
          heard_on_day: state.day,
          confidence: rng.pick(["low", "medium", "high"] as const),
        });
        added++;
      }
      saveGame(db, state, serializeRng(rng));
      appendEvent(db, sessionId, state.day, "listen", { rumors_added: added });
      return { rumors_added: added, day: state.day };
    },

    planTravel(sessionId, destinationCityId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const edge = state.world.edges.find(
        e => (e.a === state.current_city_id && e.b === destinationCityId) ||
             (e.b === state.current_city_id && e.a === destinationCityId),
      );
      if (!edge) return { ok: false, error: "destination is not a direct neighbor" };
      const dest = state.world.cities.find(c => c.id === destinationCityId);
      if (!dest) return { ok: false, error: "unknown destination city" };

      // Use a throwaway RNG so the preview doesn't advance the persisted rng_state.
      // (deserializeRng is already imported at the top of this file.)
      const previewRng = deserializeRng(loaded.rng_state);
      const carried = totalWeight(state.inventory);
      const travelCalc = computeTravelTime(edge, state.world.events, state.day, carried, state.crew, previewRng);

      const events_active = state.world.events
        .filter(ev => state.day >= ev.start_day && state.day < ev.start_day + ev.duration)
        .filter(ev => ev.target_edge_ids?.includes(`${edge.a}:${edge.b}`))
        .map(ev => ({ kind: ev.kind, start_day: ev.start_day, duration: ev.duration }));

      const wage_per_day = state.crew.reduce((s, c) => s + c.daily_wage, 0);
      return {
        ok: true,
        destination: { id: dest.id, name: dest.name, archetype: dest.archetype },
        estimated_time: Math.round(travelCalc.time * 100) / 100,
        terrain: edge.terrain,
        active_events: events_active,
        estimated_wage_cost: Math.round(wage_per_day * travelCalc.time),
      };
    },

    travel(sessionId, destinationCityId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") throw new Error("run is completed");
      const state = loaded.state;
      const edge = state.world.edges.find(
        e => (e.a === state.current_city_id && e.b === destinationCityId) ||
             (e.b === state.current_city_id && e.a === destinationCityId),
      );
      if (!edge) throw new Error("destination is not a direct neighbor");

      const rng = deserializeRng(loaded.rng_state);
      const carried = totalWeight(state.inventory);
      const travelCalc = computeTravelTime(edge, state.world.events, state.day, carried, state.crew, rng);
      const encounters = rollEncounters(edge, state.world.events, state.day, state.crew, rng);

      // Deduct wages for the full travel duration.
      const wage = state.crew.reduce((s, c) => s + c.daily_wage, 0) * travelCalc.time;
      state.gold = Math.max(0, state.gold - Math.round(wage));

      // Advance day.
      state.day += travelCalc.time;

      if (encounters.length > 0) {
        // Build options for the first encounter; keep remaining pending.
        encounters[0]!.options = buildEncounterOptions(encounters[0]!, carried, state.crew);
        state.pending_leg = {
          from_city_id: state.current_city_id,
          to_city_id: destinationCityId,
          total_travel_time: travelCalc.time,
          remaining_encounters: encounters.slice(1),
          current_encounter: encounters[0]!,
        };
        saveGame(db, state, serializeRng(rng));
        appendEvent(db, sessionId, state.day, "travel_encounter", { to: destinationCityId, kind: encounters[0]!.kind });
        const enc = encounters[0]!;
        return {
          outcome: "encounter" as const,
          day: state.day,
          encounter: { id: enc.id, category: enc.category, kind: enc.kind, narrative_seed: enc.narrative_seed,
            options: enc.options.map(o => ({ id: o.id, success_pct: o.success_pct, cost_gold: o.cost_gold })) },
        };
      }

      // No encounters — straight arrival.
      return arriveAt(db, loaded, state, destinationCityId, rng, travelCalc.notes);
    },

    resolveEncounter(sessionId: string, choice: EncounterOption["id"]) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      if (loaded.status === "completed") throw new Error("run is completed");
      const state = loaded.state;
      if (!state.pending_leg?.current_encounter) throw new Error("no pending encounter to resolve");
      const enc = state.pending_leg.current_encounter;
      const rng = deserializeRng(loaded.rng_state);

      const result = resolveEncounter(enc.options, choice, rng);
      const outcome = result.outcome;
      state.gold = Math.max(0, state.gold + outcome.gold_delta);
      state.day += outcome.time_lost_days;
      for (const { commodity, quantity } of outcome.goods_lost) {
        state.inventory.commodities[commodity] = Math.max(0, state.inventory.commodities[commodity] - quantity);
      }
      for (const { commodity, quantity } of outcome.goods_gained) {
        state.inventory.commodities[commodity] += quantity;
      }
      for (const u of outcome.unique_items_gained) state.inventory.unique_items.push(u);
      for (const id of outcome.unique_items_lost_ids) {
        state.inventory.unique_items = state.inventory.unique_items.filter(u => u.id !== id);
      }
      for (const r of outcome.rumors_gained) state.known_rumors.push(r);
      for (const cc of outcome.crew_changes) {
        if (cc.change === "lost") state.crew = state.crew.filter(c => c.id !== cc.crew_id);
      }
      state.history.encounters_survived += 1;

      appendEvent(db, sessionId, state.day, "encounter_resolved", {
        enc_id: enc.id, choice, success: result.success, gold_delta: outcome.gold_delta,
      });

      // Advance to next encounter, or arrive.
      const remaining = state.pending_leg.remaining_encounters;
      if (remaining.length > 0) {
        const next = remaining[0]!;
        next.options = buildEncounterOptions(next, totalWeight(state.inventory), state.crew);
        state.pending_leg.current_encounter = next;
        state.pending_leg.remaining_encounters = remaining.slice(1);
        saveGame(db, state, serializeRng(rng));
        return {
          outcome: "encounter" as const,
          day: state.day,
          encounter: { id: next.id, category: next.category, kind: next.kind, narrative_seed: next.narrative_seed,
            options: next.options.map(o => ({ id: o.id, success_pct: o.success_pct, cost_gold: o.cost_gold })) },
        };
      }

      // Arrive at destination.
      const destId = state.pending_leg.to_city_id;
      return arriveAt(db, loaded, state, destId, rng, []);
    },

    endGame(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const finalCity = state.world.cities.find(c => c.id === state.current_city_id)!;
      const { total, breakdown } = tallyFinalScore(state.gold, state.inventory, finalCity);
      saveGame(db, state, loaded.rng_state, "completed");
      appendEvent(db, sessionId, state.day, "end_game", { final_score: total, breakdown });
      return { final_score: total, breakdown };
    },

    resumeGame(sessionId) {
      const loaded = loadGame(db, sessionId);
      if (!loaded) throw new Error(`No game with session_id '${sessionId}'`);
      const state = loaded.state;
      const city = state.world.cities.find(c => c.id === state.current_city_id)!;
      return {
        session_id: sessionId, day: state.day, gold: state.gold,
        current_city: { id: city.id, name: city.name },
        days_remaining: Math.max(0, DAY_LIMIT - state.day),
        status: loaded.status,
      };
    },
  };
}
