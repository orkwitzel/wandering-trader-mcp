export type Commodity =
  | "grain" | "salt" | "spice" | "silk"
  | "iron" | "furs" | "wine" | "gems";

export const COMMODITIES: readonly Commodity[] = [
  "grain", "salt", "spice", "silk", "iron", "furs", "wine", "gems",
];

export type Archetype =
  | "port" | "mining" | "farmland" | "forest"
  | "trade_capital" | "border" | "desert";

export type Terrain = "road" | "forest" | "mountain" | "river" | "coast" | "desert";

export type Weather = "clear" | "rain" | "storm";

export type HireKind =
  | "bodyguard" | "scout"
  | "desert_guide" | "sea_navigator" | "forest_ranger"
  | "pack_animal";

export type UniqueItemCategory = "art" | "weapon" | "relic" | "book" | "curio";

export interface UniqueItem {
  id: string;
  name: string;
  category: UniqueItemCategory;
  weight: number;
  buy_price: number;       // price at the city currently offering it
  origin_city_id: string;
}

export interface Crew {
  id: string;
  kind: HireKind;
  daily_wage: number;
  hired_on_day: number;
}

export interface Inventory {
  commodities: Record<Commodity, number>;   // unit counts
  unique_items: UniqueItem[];
}

export interface City {
  id: string;
  name: string;
  archetype: Archetype;
  position: { x: number; y: number };
  price_table: Record<Commodity, number>;         // current buy-side mid; sell = buy × (1 − spread)
  local_memory: Record<Commodity, number>;        // running nudge term from player's trades here
  unique_offers: UniqueItem[];
  hires_available: Crew[];
}

export interface Edge {
  a: string;                // city id
  b: string;                // city id
  distance: number;         // base travel time in fractional days
  terrain: Terrain;
}

export type EventKind =
  | "famine" | "glut" | "festival" | "caravan_arrival" | "trade_war"
  | "sandstorm_season" | "spring_floods" | "blizzard";

export interface WorldEvent {
  id: string;
  kind: EventKind;
  start_day: number;
  duration: number;
  target_city_ids?: string[];
  target_edge_ids?: string[];                       // "a:b" keys
  target_commodities?: Commodity[];
  price_multiplier?: number;                        // for economic events
  encounter_rate_multiplier?: number;               // for environmental events
}

export interface Rumor {
  id: string;
  about_city_id?: string;
  about_edge_id?: string;
  topic: "archetype" | "price_trend" | "event" | "terrain";
  text: string;                                     // short tool-generated description
  heard_on_day: number;
  confidence: "low" | "medium" | "high";
}

export interface World {
  cities: City[];
  edges: Edge[];
  events: WorldEvent[];
}

export interface PendingEncounter {
  id: string;
  category: "hostile" | "environmental" | "neutral";
  kind: string;                                     // e.g., "bandits", "sandstorm", "lost_traveler"
  narrative_seed: string;                           // LLM anchor
  options: EncounterOption[];
}

export interface EncounterOption {
  id: "fight" | "flee" | "bribe" | "parley" | "endure" | "help" | "accept" | "ignore";
  success_pct: number;                              // 5..95
  cost_gold?: number;                               // for bribe
  on_success: EncounterOutcome;
  on_failure: EncounterOutcome;
}

export interface EncounterOutcome {
  time_lost_days: number;
  gold_delta: number;
  goods_lost: { commodity: Commodity; quantity: number }[];
  goods_gained: { commodity: Commodity; quantity: number }[];
  unique_items_gained: UniqueItem[];
  unique_items_lost_ids: string[];
  rumors_gained: Rumor[];
  crew_changes: { crew_id: string; change: "lost" | "joined" }[];
}

export interface PendingLeg {
  from_city_id: string;
  to_city_id: string;
  remaining_encounters: PendingEncounter[];
  current_encounter?: PendingEncounter;
}

export interface GameState {
  session_id: string;
  day: number;                                      // 0.0 → 7.0 (fractional)
  gold: number;
  inventory: Inventory;
  crew: Crew[];
  current_city_id: string;
  visited_city_ids: string[];
  known_rumors: Rumor[];
  world: World;
  pending_leg?: PendingLeg;
  history: {
    encounters_resolved: number;
    cities_visited: number;
  };
}

export const DAY_LIMIT = 7;
