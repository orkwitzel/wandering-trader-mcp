// Seeded PRNG (mulberry32). State is a single 32-bit integer.
// https://stackoverflow.com/a/47593316 (public-domain snippet)

export interface Rng {
  state: { s: number };
  next(): number;                       // returns [0, 1)
  nextInt(loInclusive: number, hiExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
}

function mulberry32(seedRef: { s: number }): () => number {
  return () => {
    seedRef.s = (seedRef.s + 0x6D2B79F5) | 0;
    let t = seedRef.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const state = { s: seed | 0 };
  const raw = mulberry32(state);
  return {
    state,
    next: raw,
    nextInt(lo, hi) {
      return lo + Math.floor(raw() * (hi - lo));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error("pick from empty array");
      return arr[Math.floor(raw() * arr.length)]!;
    },
  };
}

export function serializeRng(r: Rng): string {
  return String(r.state.s);
}

export function deserializeRng(s: string): Rng {
  const seed = Number(s) | 0;
  const state = { s: seed };
  const raw = mulberry32(state);
  return {
    state,
    next: raw,
    nextInt(lo, hi) { return lo + Math.floor(raw() * (hi - lo)); },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error("pick from empty array");
      return arr[Math.floor(raw() * arr.length)]!;
    },
  };
}
