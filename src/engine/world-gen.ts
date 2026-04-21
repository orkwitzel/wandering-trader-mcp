// World generation: city placement, edge graph, initial events.

import type { Archetype, City, Commodity, Edge, EventKind, Terrain, World, WorldEvent } from "./types";
import { COMMODITIES } from "./types";
import {
  ARCHETYPE_PRICE_MULT,
  CITY_NAME_PREFIXES, CITY_NAME_SUFFIXES,
  COMMODITY_SPECS,
  EVENT_SPECS,
  NUM_CITIES_MAX, NUM_CITIES_MIN,
} from "./content";
import type { Rng } from "./rng";

const ARCHETYPE_POOL: Archetype[] = [
  "port", "mining", "farmland", "forest",
  "trade_capital", "border", "desert",
];

const MAP_SIZE = 100;

function generateName(archetype: Archetype, rng: Rng, taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const prefix = rng.pick(CITY_NAME_PREFIXES[archetype]);
    const suffix = rng.pick(CITY_NAME_SUFFIXES[archetype]);
    const name = (prefix + suffix).replace(/\s+/g, "");
    const cased = name.charAt(0).toUpperCase() + name.slice(1);
    if (!taken.has(cased)) {
      taken.add(cased);
      return cased;
    }
  }
  const fallback = `Settlement${taken.size}`;
  taken.add(fallback);
  return fallback;
}

function makeInitialPriceTable(archetype: Archetype, rng: Rng): Record<Commodity, number> {
  const table = {} as Record<Commodity, number>;
  for (const c of COMMODITIES) {
    const spec = COMMODITY_SPECS[c];
    const biased = spec.base_price * ARCHETYPE_PRICE_MULT[archetype][c];
    const drift = 1 + (rng.next() * 2 - 1) * spec.volatility;
    table[c] = Math.max(spec.min_price, Math.min(spec.max_price, biased * drift));
  }
  return table;
}

function distance(a: City, b: City): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickTerrain(a: City, b: City, rng: Rng): Terrain {
  const arc = [a.archetype, b.archetype];
  if (arc.includes("desert")) return "desert";
  if (arc.includes("port")) return "coast";
  if (arc.includes("forest")) return "forest";
  if (arc.includes("mining")) return "mountain";
  return rng.pick<Terrain>(["road", "road", "road", "forest", "mountain", "river"]);
}

export function generateEdges(cities: City[], rng: Rng): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join("|");

  for (const c of cities) {
    const neighbors = cities
      .filter(o => o.id !== c.id)
      .map(o => ({ o, d: distance(c, o) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, rng.nextInt(2, 4));
    for (const { o, d } of neighbors) {
      const k = key(c.id, o.id);
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({
        a: c.id < o.id ? c.id : o.id,
        b: c.id < o.id ? o.id : c.id,
        distance: d / 40,
        terrain: pickTerrain(c, o, rng),
      });
    }
  }

  const parent: Record<string, string> = {};
  for (const c of cities) parent[c.id] = c.id;
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: string, b: string) => { parent[find(a)] = find(b); };
  for (const e of edges) union(e.a, e.b);

  const components = new Map<string, City[]>();
  for (const c of cities) {
    const r = find(c.id);
    if (!components.has(r)) components.set(r, []);
    components.get(r)!.push(c);
  }
  const comps = [...components.values()];
  for (let i = 1; i < comps.length; i++) {
    let best: { a: City; b: City; d: number } | null = null;
    for (const a of comps[0]!) {
      for (const b of comps[i]!) {
        const d = distance(a, b);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    if (best) {
      const k = key(best.a.id, best.b.id);
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({
          a: best.a.id < best.b.id ? best.a.id : best.b.id,
          b: best.a.id < best.b.id ? best.b.id : best.a.id,
          distance: best.d / 40,
          terrain: pickTerrain(best.a, best.b, rng),
        });
        union(best.a.id, best.b.id);
      }
    }
  }
  return edges;
}

export function generateCities(rng: Rng): City[] {
  const n = rng.nextInt(NUM_CITIES_MIN, NUM_CITIES_MAX + 1);
  const names = new Set<string>();
  const cities: City[] = [];
  for (let i = 0; i < n; i++) {
    const archetype: Archetype = i < ARCHETYPE_POOL.length
      ? ARCHETYPE_POOL[i]!
      : rng.pick(ARCHETYPE_POOL);
    const name = generateName(archetype, rng, names);
    const zeroMem = {} as Record<Commodity, number>;
    for (const c of COMMODITIES) zeroMem[c] = 0;
    cities.push({
      id: `c${i}`,
      name,
      archetype,
      position: { x: rng.next() * MAP_SIZE, y: rng.next() * MAP_SIZE },
      price_table: makeInitialPriceTable(archetype, rng),
      local_memory: zeroMem,
      unique_offers: [],
      hires_available: [],
    });
  }
  return cities;
}

const ECONOMIC_EVENTS: EventKind[] = ["famine", "glut", "festival", "caravan_arrival", "trade_war"];
const ENV_EVENTS: EventKind[] = ["sandstorm_season", "spring_floods", "blizzard"];

function generateEvents(cities: City[], edges: Edge[], rng: Rng): WorldEvent[] {
  const events: WorldEvent[] = [];
  const count = rng.nextInt(3, 7);

  for (let i = 0; i < count; i++) {
    const isEconomic = rng.next() < 0.6;
    const kind = isEconomic ? rng.pick(ECONOMIC_EVENTS) : rng.pick(ENV_EVENTS);
    const spec = EVENT_SPECS[kind];
    const start_day = spec.min_day + rng.next() * (spec.max_day - spec.min_day);
    const duration = spec.min_duration + rng.next() * (spec.max_duration - spec.min_duration);

    const ev: WorldEvent = {
      id: `ev${i}`,
      kind,
      start_day,
      duration,
    };

    if (isEconomic) {
      const city = rng.pick(cities);
      const commodity = rng.pick<Commodity>([...COMMODITIES]);
      ev.target_city_ids = [city.id];
      ev.target_commodities = [commodity];
      ev.price_multiplier = spec.price_multiplier;
    } else {
      const terrainForEvent: Record<EventKind, string[]> = {
        sandstorm_season: ["desert"],
        spring_floods:    ["river", "coast"],
        blizzard:         ["mountain"],
        famine: [], glut: [], festival: [], caravan_arrival: [], trade_war: [],
      };
      const matching = edges.filter(e => terrainForEvent[kind].includes(e.terrain));
      const picked = matching.length > 0
        ? matching.filter((_, idx) => idx < 3)
        : edges.filter((_, idx) => idx < 2);
      ev.target_edge_ids = picked.map(e => `${e.a}:${e.b}`);
      ev.encounter_rate_multiplier = spec.encounter_rate_multiplier;
    }
    events.push(ev);
  }
  return events;
}

export function generateWorld(rng: Rng): World {
  const cities = generateCities(rng);
  const edges = generateEdges(cities, rng);
  const events = generateEvents(cities, edges, rng);
  return { cities, edges, events };
}
