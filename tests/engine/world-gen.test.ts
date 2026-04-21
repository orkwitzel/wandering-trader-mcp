import { test, expect } from "bun:test";
import { createRng } from "../../src/engine/rng";
import { generateCities } from "../../src/engine/world-gen";
import { NUM_CITIES_MIN, NUM_CITIES_MAX } from "../../src/engine/content";

test("generateCities returns between NUM_CITIES_MIN and NUM_CITIES_MAX cities", () => {
  const rng = createRng(1);
  const cities = generateCities(rng);
  expect(cities.length).toBeGreaterThanOrEqual(NUM_CITIES_MIN);
  expect(cities.length).toBeLessThanOrEqual(NUM_CITIES_MAX);
});

test("generateCities produces unique ids and non-empty names", () => {
  const cities = generateCities(createRng(2));
  const ids = new Set(cities.map(c => c.id));
  expect(ids.size).toBe(cities.length);
  for (const c of cities) {
    expect(c.name.length).toBeGreaterThan(0);
    expect(c.position.x).toBeGreaterThanOrEqual(0);
    expect(c.position.y).toBeGreaterThanOrEqual(0);
  }
});

test("generateCities is deterministic under same seed", () => {
  const a = generateCities(createRng(42));
  const b = generateCities(createRng(42));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test("generateCities includes at least one of each archetype when N is large enough — soft check", () => {
  const cities = generateCities(createRng(5));
  const archetypes = new Set(cities.map(c => c.archetype));
  expect(archetypes.size).toBeGreaterThanOrEqual(4);
});

import { generateEdges } from "../../src/engine/world-gen";

function connected(nCities: number, edges: { a: string; b: string }[]): boolean {
  const parent: Record<string, string> = {};
  const ids = Array.from({ length: nCities }, (_, i) => `c${i}`);
  for (const id of ids) parent[id] = id;
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: string, b: string) => { parent[find(a)] = find(b); };
  for (const e of edges) union(e.a, e.b);
  const root = find(ids[0]!);
  return ids.every(id => find(id) === root);
}

test("generateEdges produces a connected graph", () => {
  const rng = createRng(3);
  const cities = generateCities(rng);
  const edges = generateEdges(cities, rng);
  expect(connected(cities.length, edges)).toBe(true);
});

test("generateEdges gives every city at least one neighbor", () => {
  const rng = createRng(4);
  const cities = generateCities(rng);
  const edges = generateEdges(cities, rng);
  const degree: Record<string, number> = {};
  for (const c of cities) degree[c.id] = 0;
  for (const e of edges) { degree[e.a]!++; degree[e.b]!++; }
  for (const c of cities) expect(degree[c.id]).toBeGreaterThanOrEqual(1);
});

test("generateEdges is deterministic under same seed", () => {
  const cities = generateCities(createRng(7));
  const a = generateEdges(cities, createRng(8));
  const b = generateEdges(cities, createRng(8));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

import { generateWorld } from "../../src/engine/world-gen";
import { DAY_LIMIT } from "../../src/engine/types";

test("generateWorld returns cities, edges, and events", () => {
  const world = generateWorld(createRng(10));
  expect(world.cities.length).toBeGreaterThanOrEqual(10);
  expect(world.edges.length).toBeGreaterThan(0);
  expect(world.events.length).toBeGreaterThanOrEqual(1);
});

test("generateWorld events have valid start_day + duration", () => {
  const world = generateWorld(createRng(11));
  for (const ev of world.events) {
    expect(ev.start_day).toBeGreaterThanOrEqual(0);
    expect(ev.start_day).toBeLessThanOrEqual(DAY_LIMIT);
    expect(ev.duration).toBeGreaterThan(0);
  }
});

test("generateWorld is deterministic under same seed", () => {
  const a = generateWorld(createRng(999));
  const b = generateWorld(createRng(999));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
