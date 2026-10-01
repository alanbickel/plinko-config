export interface Rng {
  readonly seed: number;
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** -1 or 1. */
  sign(): number;
}

/** Small, fast, seedable PRNG (mulberry32). Not for anything security-related. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: seed >>> 0,
    next,
    range: (min, max) => min + (max - min) * next(),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/** Mixes two integers into a well-spread 32-bit seed, e.g. (sessionSeed, dropId). */
export function hashSeed(a: number, b: number): number {
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
