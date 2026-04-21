import type { Crew, Commodity, EncounterOption, EncounterOutcome, PendingEncounter, HireKind } from "./types";
import {
  BASE_BRIBE_SUCCESS, BASE_ENVIRONMENTAL_SUCCESS, BASE_FIGHT_SUCCESS,
  BASE_FLEE_SUCCESS, BASE_PARLEY_SUCCESS,
  BODYGUARD_FIGHT_BONUS, GUIDE_ENV_BONUS, SCOUT_BONUS,
  REFERENCE_WEIGHT, WEIGHT_ODDS_COEFF,
} from "./content";
import type { Rng } from "./rng";

const clamp = (p: number): number => Math.max(5, Math.min(95, Math.round(p)));

function weightPenalty(weight: number): number {
  return (weight / REFERENCE_WEIGHT) * WEIGHT_ODDS_COEFF;
}

function matchingGuideForEnv(kind: string, crew: Crew[]): boolean {
  const map: Record<string, HireKind> = {
    sandstorm: "desert_guide", heatstroke: "desert_guide", lost_in_desert: "desert_guide",
    lost_in_forest: "forest_ranger", trap: "forest_ranger", swarm: "forest_ranger",
    lost_at_sea: "sea_navigator", wrecker_rocks: "sea_navigator",
  };
  const needed = map[kind];
  return needed !== undefined && crew.some(c => c.kind === needed);
}

function emptyOutcome(): EncounterOutcome {
  return {
    time_lost_days: 0, gold_delta: 0,
    goods_lost: [], goods_gained: [],
    unique_items_gained: [], unique_items_lost_ids: [],
    rumors_gained: [], crew_changes: [],
  };
}

function hostileOptions(_kind: string, weight: number, crew: Crew[]): EncounterOption[] {
  const wp = weightPenalty(weight);
  const bg = crew.filter(c => c.kind === "bodyguard").length;
  const fight_pct = clamp(BASE_FIGHT_SUCCESS + bg * BODYGUARD_FIGHT_BONUS - wp);
  const flee_pct = clamp(BASE_FLEE_SUCCESS - wp * 1.2);
  const bribe_pct = clamp(BASE_BRIBE_SUCCESS - wp * 0.3);
  const parley_pct = clamp(BASE_PARLEY_SUCCESS + bg * 2 - wp * 0.6);

  const succ = (delta: Partial<EncounterOutcome>): EncounterOutcome => ({ ...emptyOutcome(), ...delta });

  return [
    {
      id: "fight", success_pct: fight_pct,
      on_success: succ({ gold_delta: 40 }),
      on_failure: succ({ gold_delta: -90, time_lost_days: 0.4 }),
    },
    {
      id: "flee", success_pct: flee_pct,
      on_success: succ({ time_lost_days: 0.3 }),
      on_failure: succ({ time_lost_days: 0.5 }),
    },
    {
      id: "bribe", success_pct: bribe_pct, cost_gold: 60,
      on_success: succ({ gold_delta: 0 }),                 // cost is already the cost_gold
      on_failure: succ({ time_lost_days: 0.3 }),
    },
    {
      id: "parley", success_pct: parley_pct,
      on_success: succ({}),
      on_failure: succ({ time_lost_days: 0.3, gold_delta: -60 }),
    },
  ];
}

function environmentalOptions(kind: string, weight: number, crew: Crew[]): EncounterOption[] {
  const wp = weightPenalty(weight);
  const guideMatch = matchingGuideForEnv(kind, crew);
  const scouts = crew.filter(c => c.kind === "scout").length;
  const base = BASE_ENVIRONMENTAL_SUCCESS + (guideMatch ? GUIDE_ENV_BONUS : 0) + scouts * SCOUT_BONUS;
  const endure_pct = clamp(base - wp);
  const flee_pct   = clamp(BASE_FLEE_SUCCESS - wp * 1.5);

  const succ = (delta: Partial<EncounterOutcome>): EncounterOutcome => ({ ...emptyOutcome(), ...delta });
  return [
    {
      id: "endure", success_pct: endure_pct,
      on_success: succ({ time_lost_days: 0.15 }),
      on_failure: succ({ time_lost_days: 0.8, gold_delta: -20 }),
    },
    {
      id: "flee", success_pct: flee_pct,
      on_success: succ({ time_lost_days: 0.4 }),
      on_failure: succ({ time_lost_days: 1.0 }),
    },
  ];
}

function neutralOptions(_kind: string): EncounterOption[] {
  const succ = (delta: Partial<EncounterOutcome>): EncounterOutcome => ({ ...emptyOutcome(), ...delta });
  return [
    {
      id: "help", success_pct: 80,
      on_success: succ({ time_lost_days: 0.2, gold_delta: 30 }),
      on_failure: succ({ time_lost_days: 0.2 }),
    },
    {
      id: "accept", success_pct: 95,
      on_success: succ({ gold_delta: 20 }),
      on_failure: succ({}),
    },
    {
      id: "ignore", success_pct: 95,
      on_success: succ({}),
      on_failure: succ({}),
    },
  ];
}

export function buildEncounterOptions(
  enc: PendingEncounter, carried_weight: number, crew: Crew[],
): EncounterOption[] {
  if (enc.category === "hostile") return hostileOptions(enc.kind, carried_weight, crew);
  if (enc.category === "environmental") return environmentalOptions(enc.kind, carried_weight, crew);
  return neutralOptions(enc.kind);
}

export interface ResolutionResult {
  option_id: EncounterOption["id"];
  success: boolean;
  outcome: EncounterOutcome;
}

export interface EnrichOutcomeCtx {
  optionId: EncounterOption["id"];
  success: boolean;
  category: PendingEncounter["category"];
  heldCommodities: { commodity: Commodity; quantity: number }[];
  otherCities: { id: string; name: string; archetype: string }[];
  rng: Rng;
  day: number;
}

export function enrichOutcome(outcome: EncounterOutcome, ctx: EnrichOutcomeCtx): EncounterOutcome {
  const out: EncounterOutcome = {
    time_lost_days: outcome.time_lost_days,
    gold_delta: outcome.gold_delta,
    goods_lost: [...outcome.goods_lost],
    goods_gained: [...outcome.goods_gained],
    unique_items_gained: [...outcome.unique_items_gained],
    unique_items_lost_ids: [...outcome.unique_items_lost_ids],
    rumors_gained: [...outcome.rumors_gained],
    crew_changes: [...outcome.crew_changes],
  };

  // Flee or fight failure: drop up to 1 (flee) or 2 (fight) random goods we actually hold.
  if (!ctx.success && (ctx.optionId === "flee" || ctx.optionId === "fight" || ctx.optionId === "parley")) {
    const available = ctx.heldCommodities.filter(c => c.quantity > 0);
    const n = ctx.optionId === "fight" ? Math.min(2, available.length) : Math.min(1, available.length);
    for (let i = 0; i < n; i++) {
      const pick = ctx.rng.pick(available);
      out.goods_lost.push({ commodity: pick.commodity, quantity: 1 });
    }
  }

  // Parley success: generate a low-confidence archetype rumor about another city.
  if (ctx.success && ctx.optionId === "parley" && ctx.otherCities.length > 0) {
    const target = ctx.rng.pick(ctx.otherCities);
    out.rumors_gained.push({
      id: `r-parley-${ctx.day.toFixed(2)}-${ctx.rng.nextInt(0, 0x7fffffff).toString(36)}`,
      about_city_id: target.id,
      topic: "archetype",
      text: `A bandit lets slip that ${target.name} is a ${target.archetype.replace("_", " ")}.`,
      heard_on_day: ctx.day,
      confidence: "low",
    });
  }

  return out;
}

export function resolveEncounter(
  options: EncounterOption[],
  choice: EncounterOption["id"],
  rng: Rng,
): ResolutionResult {
  const opt = options.find(o => o.id === choice);
  if (!opt) throw new Error(`Unknown option '${choice}' for encounter`);
  const roll = rng.next() * 100;
  const success = roll < opt.success_pct;
  const base = success ? opt.on_success : opt.on_failure;
  const outcome: EncounterOutcome = {
    time_lost_days: base.time_lost_days,
    gold_delta: base.gold_delta,
    goods_lost: [...base.goods_lost],
    goods_gained: [...base.goods_gained],
    unique_items_gained: [...base.unique_items_gained],
    unique_items_lost_ids: [...base.unique_items_lost_ids],
    rumors_gained: [...base.rumors_gained],
    crew_changes: [...base.crew_changes],
  };
  // Bribe cost is applied regardless of success.
  if (opt.id === "bribe" && opt.cost_gold) {
    outcome.gold_delta = (outcome.gold_delta ?? 0) - opt.cost_gold;
  }
  return { option_id: opt.id, success, outcome };
}
