import type {
  Archetype, Commodity, HireKind, EventKind, UniqueItemCategory, Terrain, Weather,
} from "./types";

export interface CommoditySpec {
  base_price: number;
  weight_per_unit: number;
  volatility: number;          // drift ±volatility per tick (as fraction of base)
  min_price: number;
  max_price: number;
}

export const COMMODITY_SPECS: Record<Commodity, CommoditySpec> = {
  grain: { base_price: 10,  weight_per_unit: 10, volatility: 0.08, min_price: 4,   max_price: 40   },
  salt:  { base_price: 15,  weight_per_unit: 6,  volatility: 0.10, min_price: 6,   max_price: 60   },
  spice: { base_price: 60,  weight_per_unit: 2,  volatility: 0.15, min_price: 20,  max_price: 240  },
  silk:  { base_price: 80,  weight_per_unit: 3,  volatility: 0.12, min_price: 30,  max_price: 300  },
  iron:  { base_price: 25,  weight_per_unit: 20, volatility: 0.08, min_price: 10,  max_price: 100  },
  furs:  { base_price: 35,  weight_per_unit: 5,  volatility: 0.10, min_price: 14,  max_price: 140  },
  wine:  { base_price: 20,  weight_per_unit: 8,  volatility: 0.10, min_price: 8,   max_price: 80   },
  gems:  { base_price: 200, weight_per_unit: 0.5, volatility: 0.20, min_price: 60, max_price: 800 },
};

export const SELL_SPREAD = 0.15;        // sell = buy × (1 − SELL_SPREAD)

// Archetype multipliers on commodity base prices. 1.0 = neutral; <1.0 = cheaper here; >1.0 = dearer.
export const ARCHETYPE_PRICE_MULT: Record<Archetype, Record<Commodity, number>> = {
  port:           { grain: 1.2, salt: 0.9, spice: 0.6, silk: 0.6, iron: 1.2, furs: 1.0, wine: 1.0, gems: 1.0 },
  mining:         { grain: 1.3, salt: 1.0, spice: 1.2, silk: 1.4, iron: 0.5, furs: 1.0, wine: 1.3, gems: 0.7 },
  farmland:       { grain: 0.6, salt: 0.9, spice: 1.2, silk: 1.3, iron: 1.2, furs: 1.1, wine: 0.7, gems: 1.0 },
  forest:         { grain: 1.1, salt: 0.8, spice: 1.0, silk: 1.3, iron: 1.1, furs: 0.6, wine: 1.0, gems: 1.2 },
  trade_capital:  { grain: 1.0, salt: 1.0, spice: 1.0, silk: 1.0, iron: 1.0, furs: 1.0, wine: 1.0, gems: 1.0 },
  border:         { grain: 1.1, salt: 1.1, spice: 1.1, silk: 1.1, iron: 1.1, furs: 1.1, wine: 1.1, gems: 1.1 },
  desert:         { grain: 1.4, salt: 0.5, spice: 1.0, silk: 1.1, iron: 1.2, furs: 1.4, wine: 1.5, gems: 0.7 },
};

export interface HireSpec {
  kind: HireKind;
  hire_fee: number;
  daily_wage: number;
}

export const HIRE_SPECS: Record<HireKind, HireSpec> = {
  bodyguard:      { kind: "bodyguard",      hire_fee: 30,  daily_wage: 15 },
  scout:          { kind: "scout",          hire_fee: 20,  daily_wage: 10 },
  desert_guide:   { kind: "desert_guide",   hire_fee: 40,  daily_wage: 20 },
  sea_navigator:  { kind: "sea_navigator",  hire_fee: 40,  daily_wage: 20 },
  forest_ranger:  { kind: "forest_ranger",  hire_fee: 30,  daily_wage: 15 },
  pack_animal:    { kind: "pack_animal",    hire_fee: 50,  daily_wage:  8 },
};

// Which hire types tend to appear in which archetype's roster.
export const ARCHETYPE_HIRE_BIAS: Record<Archetype, HireKind[]> = {
  port:          ["bodyguard", "sea_navigator", "scout"],
  mining:        ["bodyguard", "bodyguard", "pack_animal"],
  farmland:      ["bodyguard", "scout"],
  forest:        ["forest_ranger", "scout", "bodyguard"],
  trade_capital: ["bodyguard", "scout", "desert_guide", "sea_navigator", "forest_ranger", "pack_animal"],
  border:        ["bodyguard", "scout", "bodyguard"],
  desert:        ["desert_guide", "pack_animal", "bodyguard"],
};

// Rare-item sell-price multipliers: matches archetype's "appetite" for a category.
export const UNIQUE_SELL_MULT: Record<Archetype, Record<UniqueItemCategory, number>> = {
  port:          { art: 1.8, weapon: 1.0, relic: 1.2, book: 1.4, curio: 1.6 },
  mining:        { art: 0.9, weapon: 1.6, relic: 1.2, book: 0.7, curio: 0.9 },
  farmland:      { art: 1.2, weapon: 0.8, relic: 1.1, book: 0.9, curio: 1.0 },
  forest:        { art: 1.0, weapon: 1.2, relic: 1.8, book: 1.0, curio: 1.3 },
  trade_capital: { art: 2.4, weapon: 1.5, relic: 1.8, book: 2.6, curio: 1.7 },
  border:        { art: 0.8, weapon: 1.8, relic: 0.9, book: 0.7, curio: 1.1 },
  desert:        { art: 1.0, weapon: 1.4, relic: 2.0, book: 0.8, curio: 1.5 },
};

export interface EventSpec {
  kind: EventKind;
  category: "economic" | "environmental";
  price_multiplier?: number;
  encounter_rate_multiplier?: number;
  min_duration: number;
  max_duration: number;
  min_day: number;          // earliest start day
  max_day: number;          // latest start day
}

export const EVENT_SPECS: Record<EventKind, EventSpec> = {
  famine:           { kind: "famine",           category: "economic",      price_multiplier: 3.5, min_duration: 2, max_duration: 4, min_day: 1, max_day: 5 },
  glut:             { kind: "glut",             category: "economic",      price_multiplier: 0.35, min_duration: 2, max_duration: 3, min_day: 0, max_day: 5 },
  festival:         { kind: "festival",         category: "economic",      price_multiplier: 1.8, min_duration: 1, max_duration: 2, min_day: 1, max_day: 6 },
  caravan_arrival:  { kind: "caravan_arrival",  category: "economic",      price_multiplier: 0.6, min_duration: 1, max_duration: 2, min_day: 1, max_day: 6 },
  trade_war:        { kind: "trade_war",        category: "economic",      price_multiplier: 2.0, min_duration: 3, max_duration: 5, min_day: 0, max_day: 3 },
  sandstorm_season: { kind: "sandstorm_season", category: "environmental", encounter_rate_multiplier: 2.5, min_duration: 2, max_duration: 4, min_day: 0, max_day: 5 },
  spring_floods:    { kind: "spring_floods",    category: "environmental", encounter_rate_multiplier: 2.0, min_duration: 2, max_duration: 3, min_day: 0, max_day: 5 },
  blizzard:         { kind: "blizzard",         category: "environmental", encounter_rate_multiplier: 2.2, min_duration: 1, max_duration: 3, min_day: 2, max_day: 6 },
};

// Terrain tuning
export const TERRAIN_TIME_MULT: Record<Terrain, number> = {
  road: 1.0, forest: 1.2, mountain: 1.5, river: 1.1, coast: 1.1, desert: 1.4,
};

export const TERRAIN_ENCOUNTER_RATE: Record<Terrain, number> = {
  road: 0.6, forest: 1.2, mountain: 1.1, river: 0.8, coast: 0.9, desert: 1.3,
};

export const WEATHER_TIME_MULT: Record<Weather, number> = {
  clear: 1.0, rain: 1.2, storm: 1.6,
};

export const REFERENCE_WEIGHT = 200;    // soft weight cap — penalty scales around this
export const WEIGHT_TIME_COEFF = 0.4;   // weight_multiplier = 1 + (w/ref) × coeff
export const WEIGHT_ODDS_COEFF = 20;    // pp of odds lost at w = reference_weight

// City name parts (archetype-biased). Generator in world-gen.
export const CITY_NAME_PREFIXES: Record<Archetype, string[]> = {
  port:          ["Mar", "Cal", "Tor", "Sal", "Brin"],
  mining:        ["Iron", "Stone", "Deep", "Grim", "Hold"],
  farmland:      ["Oak", "Greens", "Field", "Mill", "Tall"],
  forest:        ["Thorn", "Moss", "Elder", "Fen", "Bough"],
  trade_capital: ["Gold", "High", "Grand", "Kaer", "Arc"],
  border:        ["Last", "Edge", "Far", "Watch", "March"],
  desert:        ["Sun", "Dun", "Mar", "Sek", "Zar"],
};

export const CITY_NAME_SUFFIXES: Record<Archetype, string[]> = {
  port:          ["haven", "port", "mouth", "quay", "reach"],
  mining:        ["delve", "hold", "pit", "vein", "shaft"],
  farmland:      ["field", "dale", "vale", "ridge", "acre"],
  forest:        ["hollow", "wood", "grove", "glade", "brake"],
  trade_capital: ["keep", "throne", "spire", "court", "crown"],
  border:        ["watch", "gate", "stand", "rim", "post"],
  desert:        ["ak",    "iri",  "dun",  "marak", "zar"],
};

// Unique-item name parts (not archetype-biased for v1).
export const UNIQUE_ITEM_NAME_PARTS = {
  art:    { adj: ["jeweled", "gilded", "engraved", "carved"], noun: ["statuette", "tapestry", "chalice", "mosaic"] },
  weapon: { adj: ["tempered", "rune-etched", "silvered", "fabled"],   noun: ["dagger", "saber", "bow", "lance"] },
  relic:  { adj: ["saint-touched", "ancient", "sealed", "blessed"],   noun: ["reliquary", "icon", "shroud", "censer"] },
  book:   { adj: ["illuminated", "banned", "cipher-bound", "rare"],   noun: ["atlas", "codex", "breviary", "ledger"] },
  curio:  { adj: ["petrified", "chimed", "star-etched", "whispering"],noun: ["egg", "bell", "compass", "charm"] },
};

export const LOCAL_MEMORY_DECAY = 0.75;     // each tick, local_memory *= decay
export const LOCAL_MEMORY_BUY_NUDGE = 0.04; // each unit bought nudges +4% of base
export const LOCAL_MEMORY_SELL_NUDGE = 0.04;

export const BASE_ENCOUNTER_RATE = 0.8;     // Poisson λ baseline per edge unit
export const BASE_FIGHT_SUCCESS = 40;
export const BASE_FLEE_SUCCESS = 55;
export const BASE_BRIBE_SUCCESS = 85;
export const BASE_PARLEY_SUCCESS = 45;
export const BASE_ENVIRONMENTAL_SUCCESS = 50;

export const BODYGUARD_HOSTILE_SUPPRESSION = 0.25;  // each bodyguard cuts hostile-fire prob by 25%
export const GUIDE_ENV_SUPPRESSION = 0.35;          // each matching guide cuts env-fire prob by 35%
export const BODYGUARD_FIGHT_BONUS = 8;             // pp per bodyguard in fight odds
export const GUIDE_ENV_BONUS = 25;                  // pp from matching guide
export const SCOUT_BONUS = 8;                       // pp on env (and sees previews)

export const STARTING_GOLD = 200;
export const NUM_CITIES_MIN = 10;
export const NUM_CITIES_MAX = 14;
