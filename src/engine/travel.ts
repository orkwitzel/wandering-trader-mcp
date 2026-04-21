import type { Crew, Edge, Weather, WorldEvent, HireKind, PendingEncounter } from "./types";
import {
  REFERENCE_WEIGHT, TERRAIN_TIME_MULT, WEATHER_TIME_MULT, WEIGHT_TIME_COEFF,
  BASE_ENCOUNTER_RATE, BODYGUARD_HOSTILE_SUPPRESSION,
  GUIDE_ENV_SUPPRESSION, TERRAIN_ENCOUNTER_RATE,
} from "./content";
import type { Rng } from "./rng";

export interface TravelResult {
  time: number;
  weather: Weather;
  disaster_penalty: number;
  notes: string[];
}

const GUIDE_FOR_TERRAIN: Record<string, HireKind | null> = {
  desert: "desert_guide",
  forest: "forest_ranger",
  coast: "sea_navigator",
  mountain: null,
  road: null,
  river: null,
};

function edgeKey(e: Edge): string { return `${e.a}:${e.b}`; }

function eventActive(ev: WorldEvent, day: number): boolean {
  return day >= ev.start_day && day < ev.start_day + ev.duration;
}

export function computeTravelTime(
  edge: Edge, events: WorldEvent[], day: number, carried_weight: number,
  crew: Crew[], rng: Rng,
): TravelResult {
  const notes: string[] = [];
  const terrainMult = TERRAIN_TIME_MULT[edge.terrain];

  // Weather roll
  const wRoll = rng.next();
  const weather: Weather = wRoll < 0.6 ? "clear" : wRoll < 0.9 ? "rain" : "storm";
  const weatherMult = WEATHER_TIME_MULT[weather];
  if (weather !== "clear") notes.push(`weather: ${weather}`);

  // Active edge events
  let eventMult = 1.0;
  let disaster = 0;
  for (const ev of events) {
    if (!eventActive(ev, day)) continue;
    if (ev.target_edge_ids?.includes(edgeKey(edge))) {
      if (ev.encounter_rate_multiplier !== undefined) {
        eventMult *= 1 + (ev.encounter_rate_multiplier - 1) * 0.2;   // events also slow travel modestly
      }
      notes.push(`active event: ${ev.kind}`);
    }
  }

  // Disaster roll — rare flat penalty, only on hazardous terrains.
  if ((edge.terrain === "desert" || edge.terrain === "mountain" || edge.terrain === "river") && rng.next() < 0.10) {
    disaster = 0.3 + rng.next() * 0.6;
    notes.push(`disaster: +${disaster.toFixed(2)} day`);
  }

  // Matching guide: −20% on terrain multiplier portion.
  const matchingGuideKind = GUIDE_FOR_TERRAIN[edge.terrain];
  const hasMatchingGuide = matchingGuideKind !== null && crew.some(c => c.kind === matchingGuideKind);
  const guideAdjust = hasMatchingGuide ? 0.8 : 1.0;
  if (hasMatchingGuide) notes.push(`guide (${matchingGuideKind}) speeds travel`);

  // Pack animal: raises reference weight → softens weight penalty.
  const packAnimals = crew.filter(c => c.kind === "pack_animal").length;
  const effectiveWeightMult = 1 + (carried_weight / (REFERENCE_WEIGHT * (1 + packAnimals))) * WEIGHT_TIME_COEFF;
  if (packAnimals > 0) notes.push(`${packAnimals} pack animal(s) reduce weight penalty`);

  const base = edge.distance * terrainMult * guideAdjust * weatherMult * effectiveWeightMult * eventMult;
  const time = base + disaster;
  return { time, weather, disaster_penalty: disaster, notes };
}

// Poisson sample via Knuth algorithm. Deterministic under the provided rng.
function poissonSample(lambda: number, rng: Rng): number {
  // Knuth. Cap iterations to avoid runaway in pathological inputs (λ > 10 won't happen here).
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  for (let i = 0; i < 40; i++) {
    k += 1;
    p *= rng.next();
    if (p <= L) break;
  }
  return Math.min(k - 1, 3);
}

const HOSTILE_KINDS = ["bandits", "raiders", "wolves", "extortionists"];
const NEUTRAL_KINDS = ["lost_traveler", "abandoned_shrine", "found_cache", "wandering_merchant"];
const ENV_BY_TERRAIN: Record<string, string[]> = {
  desert:   ["sandstorm", "heatstroke", "lost_in_desert"],
  forest:   ["lost_in_forest", "trap", "swarm"],
  mountain: ["avalanche", "rockfall", "blizzard_encounter"],
  river:    ["flash_flood", "swept_away"],
  coast:    ["lost_at_sea", "wrecker_rocks"],
  road:     ["washed_out_bridge"],
};

function chooseCategory(eventEnvMult: number, rng: Rng): "hostile" | "environmental" | "neutral" {
  const hostileW = 0.35;
  const envW = 0.30 * eventEnvMult;
  const neutralW = 0.25;
  const total = hostileW + envW + neutralW;
  const roll = rng.next() * total;
  if (roll < hostileW) return "hostile";
  if (roll < hostileW + envW) return "environmental";
  return "neutral";
}

export function rollEncounters(
  edge: Edge, events: WorldEvent[], day: number, crew: Crew[], rng: Rng,
): PendingEncounter[] {
  // Aggregate env multiplier from active events on this edge.
  let envMult = 1.0;
  for (const ev of events) {
    if (!eventActive(ev, day)) continue;
    if (ev.target_edge_ids?.includes(edgeKey(edge)) && ev.encounter_rate_multiplier) {
      envMult *= ev.encounter_rate_multiplier;
    }
  }

  const lambda = BASE_ENCOUNTER_RATE * edge.distance * TERRAIN_ENCOUNTER_RATE[edge.terrain] * (1 + (envMult - 1) * 0.4);
  const nRaw = poissonSample(lambda, rng);

  const bodyguards = crew.filter(c => c.kind === "bodyguard").length;
  const desertGuides = crew.filter(c => c.kind === "desert_guide").length;
  const forestGuides = crew.filter(c => c.kind === "forest_ranger").length;
  const seaGuides = crew.filter(c => c.kind === "sea_navigator").length;

  const result: PendingEncounter[] = [];
  for (let i = 0; i < nRaw; i++) {
    let category = chooseCategory(envMult, rng);

    // Crew suppression. Each bodyguard rerolls a hostile into nothing with prob SUPPRESSION.
    if (category === "hostile") {
      const suppressProb = 1 - Math.pow(1 - BODYGUARD_HOSTILE_SUPPRESSION, bodyguards);
      if (rng.next() < suppressProb) continue;
    } else if (category === "environmental") {
      let matchingGuides = 0;
      if (edge.terrain === "desert") matchingGuides = desertGuides;
      else if (edge.terrain === "forest") matchingGuides = forestGuides;
      else if (edge.terrain === "coast") matchingGuides = seaGuides;
      const suppressProb = 1 - Math.pow(1 - GUIDE_ENV_SUPPRESSION, matchingGuides);
      if (rng.next() < suppressProb) continue;
    }

    // Pick a specific encounter kind.
    let kind: string;
    if (category === "hostile") kind = rng.pick(HOSTILE_KINDS);
    else if (category === "environmental") kind = rng.pick(ENV_BY_TERRAIN[edge.terrain] ?? ["misfortune"]);
    else kind = rng.pick(NEUTRAL_KINDS);

    result.push({
      id: `enc-${i}-${rng.nextInt(0, 999999)}`,
      category,
      kind,
      narrative_seed: `${category}:${kind} on ${edge.terrain}`,
      options: [],   // filled in by encounters.ts once odds formulas land
    });
  }
  return result;
}
