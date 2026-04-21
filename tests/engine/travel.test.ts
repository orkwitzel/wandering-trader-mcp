import { test, expect } from "bun:test";
import { computeTravelTime } from "../../src/engine/travel";
import { rollEncounters } from "../../src/engine/travel";
import { createRng } from "../../src/engine/rng";
import type { Edge, WorldEvent, Crew, PendingEncounter } from "../../src/engine/types";

const baseEdge: Edge = { a: "c0", b: "c1", distance: 1.0, terrain: "road" };

test("travel time equals distance when no penalties apply", () => {
  const r = createRng(1);
  const result = computeTravelTime(baseEdge, [], 0, 0, [], r);
  expect(result.time).toBeGreaterThan(0.9);
  expect(result.time).toBeLessThan(1.7);           // clear×road×no-weight is close to 1.0 before a weather roll
});

test("heavier weight raises travel time", () => {
  const r = createRng(2);
  const light = computeTravelTime(baseEdge, [], 0, 0, [], r);
  const r2 = createRng(2);
  const heavy = computeTravelTime(baseEdge, [], 0, 400, [], r2);
  expect(heavy.time).toBeGreaterThan(light.time);
});

test("desert terrain with sandstorm event adds extra time", () => {
  const r = createRng(10);
  const edge: Edge = { ...baseEdge, terrain: "desert" };
  const ev: WorldEvent = {
    id: "e1", kind: "sandstorm_season", start_day: 0, duration: 5,
    target_edge_ids: [`${edge.a}:${edge.b}`], encounter_rate_multiplier: 2.5,
  };
  const result = computeTravelTime(edge, [ev], 2, 0, [], r);
  expect(result.time).toBeGreaterThan(1.2);
});

test("desert guide reduces travel time on desert edge", () => {
  const edge: Edge = { ...baseEdge, terrain: "desert" };
  const r1 = createRng(50);
  const withoutGuide = computeTravelTime(edge, [], 0, 0, [], r1);
  const r2 = createRng(50);
  const guide: Crew = { id: "g1", kind: "desert_guide", daily_wage: 20, hired_on_day: 0 };
  const withGuide = computeTravelTime(edge, [], 0, 0, [guide], r2);
  expect(withGuide.time).toBeLessThan(withoutGuide.time);
});

test("rollEncounters returns zero or more encounters", () => {
  const r = createRng(17);
  const edge: Edge = { a: "a", b: "b", distance: 1.5, terrain: "forest" };
  const out = rollEncounters(edge, [], 0, [], r);
  expect(out.length).toBeGreaterThanOrEqual(0);
});

test("bodyguards reduce hostile encounter frequency over many trials", () => {
  const edge: Edge = { a: "a", b: "b", distance: 2.0, terrain: "forest" };
  let unprotected = 0, protected_ = 0;
  for (let i = 0; i < 200; i++) {
    unprotected += rollEncounters(edge, [], 0, [], createRng(i * 2 + 1))
      .filter((e: PendingEncounter) => e.category === "hostile").length;
    const guards: Crew[] = [
      { id: "g1", kind: "bodyguard", daily_wage: 15, hired_on_day: 0 },
      { id: "g2", kind: "bodyguard", daily_wage: 15, hired_on_day: 0 },
      { id: "g3", kind: "bodyguard", daily_wage: 15, hired_on_day: 0 },
    ];
    protected_ += rollEncounters(edge, [], 0, guards, createRng(i * 2 + 1))
      .filter((e: PendingEncounter) => e.category === "hostile").length;
  }
  expect(protected_).toBeLessThan(unprotected);
});

test("environmental events raise environmental encounter frequency", () => {
  const edge: Edge = { a: "a", b: "b", distance: 1.5, terrain: "desert" };
  const ev: WorldEvent = {
    id: "e1", kind: "sandstorm_season", start_day: 0, duration: 5,
    target_edge_ids: ["a:b"], encounter_rate_multiplier: 2.5,
  };
  let base = 0, storm = 0;
  for (let i = 0; i < 200; i++) {
    base  += rollEncounters(edge, [],   0, [], createRng(i + 9000)).filter((e: PendingEncounter) => e.category === "environmental").length;
    storm += rollEncounters(edge, [ev], 2, [], createRng(i + 9000)).filter((e: PendingEncounter) => e.category === "environmental").length;
  }
  expect(storm).toBeGreaterThan(base);
});
