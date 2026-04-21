import { test, expect } from "bun:test";
import { createRng, serializeRng, deserializeRng } from "../../src/engine/rng";

test("createRng with same seed produces same sequence", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) {
    expect(a.next()).toBe(b.next());
  }
});

test("createRng with different seeds diverges", () => {
  const a = createRng(1);
  const b = createRng(2);
  expect(a.next()).not.toBe(b.next());
});

test("nextInt returns integer in [lo, hi)", () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.nextInt(5, 10);
    expect(v).toBeGreaterThanOrEqual(5);
    expect(v).toBeLessThan(10);
    expect(Number.isInteger(v)).toBe(true);
  }
});

test("pick returns one of the array elements", () => {
  const r = createRng(11);
  const items = ["a", "b", "c"];
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(r.pick(items));
  expect(seen).toEqual(new Set(items));
});

test("serialize/deserialize round-trips", () => {
  const a = createRng(99);
  for (let i = 0; i < 10; i++) a.next();
  const frozen = serializeRng(a);
  const b = deserializeRng(frozen);
  for (let i = 0; i < 50; i++) {
    expect(b.next()).toBe(a.next());
  }
});
