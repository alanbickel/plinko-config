import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, randomSeed } from './rng';

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('stays in range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      expect([-1, 1]).toContain(rng.sign());
    }
  });

  it('is roughly uniform', () => {
    const rng = createRng(3);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const b = Math.floor(rng.next() * 10);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const n of buckets) expect(Math.abs(n - 10_000)).toBeLessThan(500);
  });

  it('normalizes the seed to an unsigned 32-bit integer', () => {
    expect(createRng(-1).seed).toBe(2 ** 32 - 1);
  });
});

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2));
  });

  it('spreads neighbouring drop ids and session seeds', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 20; s++) for (let id = 0; id < 50; id++) seen.add(hashSeed(s, id));
    expect(seen.size).toBe(1000);
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashSeed(123, 456);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('randomSeed', () => {
  it('returns an unsigned 32-bit integer', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
