import { test, expect } from "bun:test";
import { buildEncounterOptions, resolveEncounter, enrichOutcome } from "../../src/engine/encounters";
import { createRng } from "../../src/engine/rng";
import type { Crew, PendingEncounter } from "../../src/engine/types";

function encounter(category: "hostile" | "environmental" | "neutral", kind: string): PendingEncounter {
  return { id: "e1", category, kind, narrative_seed: "", options: [] };
}

test("hostile encounter has fight/flee/bribe/parley options", () => {
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 0, []);
  const ids = opts.map(o => o.id);
  expect(ids).toContain("fight");
  expect(ids).toContain("flee");
  expect(ids).toContain("bribe");
  expect(ids).toContain("parley");
});

test("environmental encounter has endure/flee options, no fight or bribe", () => {
  const opts = buildEncounterOptions(encounter("environmental", "sandstorm"), 0, []);
  const ids = opts.map(o => o.id);
  expect(ids).toContain("endure");
  expect(ids).toContain("flee");
  expect(ids).not.toContain("fight");
  expect(ids).not.toContain("bribe");
});

test("neutral encounter has help/accept/ignore options", () => {
  const opts = buildEncounterOptions(encounter("neutral", "lost_traveler"), 0, []);
  const ids = opts.map(o => o.id);
  expect(ids.some(id => ["help", "accept", "ignore"].includes(id as string))).toBe(true);
});

test("all success percentages clamped to [5, 95]", () => {
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 9999, []);   // huge weight
  for (const o of opts) {
    expect(o.success_pct).toBeGreaterThanOrEqual(5);
    expect(o.success_pct).toBeLessThanOrEqual(95);
  }
});

test("more bodyguards raise fight success", () => {
  const noGuards = buildEncounterOptions(encounter("hostile", "bandits"), 100, []);
  const three: Crew[] = Array.from({ length: 3 }, (_, i) => ({
    id: `g${i}`, kind: "bodyguard", daily_wage: 15, hired_on_day: 0,
  }));
  const threeGuards = buildEncounterOptions(encounter("hostile", "bandits"), 100, three);
  const fightN = noGuards.find(o => o.id === "fight")!.success_pct;
  const fightG = threeGuards.find(o => o.id === "fight")!.success_pct;
  expect(fightG).toBeGreaterThan(fightN);
});

test("matching desert guide raises endure success on sandstorm", () => {
  const none = buildEncounterOptions(encounter("environmental", "sandstorm"), 0, []);
  const guide: Crew[] = [{ id: "dg", kind: "desert_guide", daily_wage: 20, hired_on_day: 0 }];
  const guided = buildEncounterOptions(encounter("environmental", "sandstorm"), 0, guide);
  const e1 = none.find(o => o.id === "endure")!.success_pct;
  const e2 = guided.find(o => o.id === "endure")!.success_pct;
  expect(e2).toBeGreaterThan(e1);
});

test("resolveEncounter returns the on_success outcome when rng roll succeeds", () => {
  const opts = buildEncounterOptions({ id: "e1", category: "neutral", kind: "found_cache", narrative_seed: "", options: [] }, 0, []);
  // Find the "accept" option (95% success) — on_success delta is +20 gold.
  const rng = createRng(1);        // low roll should succeed
  const res = resolveEncounter(opts, "accept", rng);
  expect(res.success).toBe(true);
  expect(res.outcome.gold_delta).toBe(20);
});

test("resolveEncounter returns on_failure branch when forced low roll beats threshold", () => {
  const opts = buildEncounterOptions({ id: "e1", category: "environmental", kind: "sandstorm", narrative_seed: "", options: [] }, 0, []);
  // Use a deterministic RNG whose first draw is > 0.99 — flee is likely below 95, will fail.
  const rigged = { next: () => 0.99, nextInt: () => 0, pick: <T>(a: T[]) => a[0]!, state: { s: 0 } };
  const res = resolveEncounter(opts, "flee", rigged as any);
  expect(res.success).toBe(false);
});

test("resolveEncounter throws on unknown option id", () => {
  const opts = buildEncounterOptions({ id: "e1", category: "hostile", kind: "bandits", narrative_seed: "", options: [] }, 0, []);
  expect(() => resolveEncounter(opts, "help" as any, createRng(1))).toThrow();
});

// enrichOutcome tests — written before implementation (TDD).
test("enrichOutcome: flee-failure produces at least one goods_lost entry given held commodities", () => {
  const rng = createRng(42);
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 0, []);
  const fleeOpt = opts.find(o => o.id === "flee")!;
  const baseOutcome = { ...fleeOpt.on_failure, goods_lost: [], goods_gained: [], rumors_gained: [] };
  const result = enrichOutcome(baseOutcome, {
    optionId: "flee",
    success: false,
    category: "hostile",
    heldCommodities: [{ commodity: "grain", quantity: 5 }, { commodity: "salt", quantity: 3 }],
    otherCities: [],
    rng,
    day: 1,
  });
  expect(result.goods_lost.length).toBeGreaterThan(0);
});

test("enrichOutcome: flee-failure produces no goods_lost when inventory is empty", () => {
  const rng = createRng(42);
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 0, []);
  const fleeOpt = opts.find(o => o.id === "flee")!;
  const baseOutcome = { ...fleeOpt.on_failure, goods_lost: [], goods_gained: [], rumors_gained: [] };
  const result = enrichOutcome(baseOutcome, {
    optionId: "flee",
    success: false,
    category: "hostile",
    heldCommodities: [{ commodity: "grain", quantity: 0 }],
    otherCities: [],
    rng,
    day: 1,
  });
  expect(result.goods_lost.length).toBe(0);
});

test("enrichOutcome: parley-success produces a rumor when other cities exist", () => {
  const rng = createRng(99);
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 0, []);
  const parleyOpt = opts.find(o => o.id === "parley")!;
  const baseOutcome = { ...parleyOpt.on_success, goods_lost: [], goods_gained: [], rumors_gained: [] };
  const result = enrichOutcome(baseOutcome, {
    optionId: "parley",
    success: true,
    category: "hostile",
    heldCommodities: [],
    otherCities: [{ id: "c2", name: "Thornwall", archetype: "border" }],
    rng,
    day: 2,
  });
  expect(result.rumors_gained.length).toBe(1);
  expect(result.rumors_gained[0]!.about_city_id).toBe("c2");
  expect(result.rumors_gained[0]!.confidence).toBe("low");
});

test("enrichOutcome: parley-success produces no rumor when no other cities", () => {
  const rng = createRng(99);
  const opts = buildEncounterOptions(encounter("hostile", "bandits"), 0, []);
  const parleyOpt = opts.find(o => o.id === "parley")!;
  const baseOutcome = { ...parleyOpt.on_success, goods_lost: [], goods_gained: [], rumors_gained: [] };
  const result = enrichOutcome(baseOutcome, {
    optionId: "parley",
    success: true,
    category: "hostile",
    heldCommodities: [],
    otherCities: [],
    rng,
    day: 2,
  });
  expect(result.rumors_gained.length).toBe(0);
});
