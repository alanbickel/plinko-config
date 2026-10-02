import { describe, expect, it } from 'vitest';
import { checkCounts, type RefillPolicy, resolveRefill, Supply } from './supply';
import type { ChipKindConfig } from './types';
import { PlinkoConfigError } from './validate';

const kinds: ChipKindConfig[] = [
  { id: 'on', label: 'On', count: 2 },
  { id: 'off', label: 'Off' }, // unlimited
];

const supply = (refill?: RefillPolicy) => new Supply({ kinds, refill: resolveRefill(refill) });

describe('Supply: counts and reservations', () => {
  it('starts from the configured counts; no count means unlimited', () => {
    expect(supply().snapshot()).toEqual({ counts: { on: 2, off: Infinity } });
  });

  it('counts a chip in hand as used, and gives it back when put back', () => {
    const s = supply();
    expect(s.reserve('on')).toBe(true);
    expect(s.count('on')).toBe(1);
    s.release('on');
    expect(s.count('on')).toBe(2);
  });

  it('spends a dropped chip', () => {
    const s = supply();
    s.reserve('on');
    s.commit('on');
    s.release('on'); // nothing in hand any more: no effect
    expect(s.count('on')).toBe(1);
  });

  it('refuses to reserve when none are left, or for an unknown kind', () => {
    const s = supply();
    s.reserve('on');
    s.reserve('on');
    expect(s.reserve('on')).toBe(false);
    expect(s.reserve('nope')).toBe(false);
  });

  it('never runs out of an unlimited kind', () => {
    const s = supply();
    for (let i = 0; i < 1000; i++) {
      s.reserve('off');
      s.commit('off');
    }
    expect(s.count('off')).toBe(Infinity);
  });
});

describe('Supply: host overrides', () => {
  it('set and add ignore the refill cap, and add never goes below 0', () => {
    const s = supply();
    s.set({ chip: 'on', count: 10 });
    s.add({ chip: 'on', amount: 5 });
    expect(s.count('on')).toBe(15);
    s.add({ chip: 'on', amount: -100 });
    expect(s.count('on')).toBe(0);
    s.set({ chip: 'on', count: Infinity });
    expect(s.count('on')).toBe(Infinity);
  });

  it('rejects unknown kinds and invalid numbers', () => {
    const s = supply();
    expect(() => s.set({ chip: 'nope', count: 1 })).toThrow(PlinkoConfigError);
    expect(() => s.set({ chip: 'on', count: -1 })).toThrow(/whole number/);
    expect(() => s.set({ chip: 'on', count: 1.5 })).toThrow(/whole number/);
    expect(() => s.add({ chip: 'on', amount: 0.5 })).toThrow(/whole number/);
  });
});

describe('Supply: refill policies', () => {
  const empty = (refill: RefillPolicy) => {
    const s = supply(refill);
    s.set({ chip: 'on', count: 0 });
    return s;
  };

  it('interval refill adds up to the starting count by default', () => {
    const s = empty({ mode: 'interval', everyMs: 1000 });
    expect(s.refillOnce()).toBe(true);
    expect(s.refillOnce()).toBe(true);
    expect(s.refillOnce()).toBe(false); // at the cap
    expect(s.snapshot().counts).toEqual({ on: 2, off: Infinity });
  });

  it('interval refill honours amount and max', () => {
    const s = empty({ mode: 'interval', everyMs: 1000, amount: 3, max: 5 });
    s.refillOnce();
    s.refillOnce();
    expect(s.count('on')).toBe(5);
  });

  it('interval refill never takes away chips the host added above the cap', () => {
    const s = supply({ mode: 'interval', everyMs: 1000 });
    s.set({ chip: 'on', count: 9 });
    expect(s.refillOnce()).toBe(false);
    expect(s.count('on')).toBe(9);
  });

  it('only on-request supply can be requested, and only when empty', () => {
    expect(supply({ mode: 'onRequest' }).canRequest('on')).toBe(false);
    expect(empty({ mode: 'onRequest' }).canRequest('on')).toBe(true);
    expect(empty({ mode: 'never' }).canRequest('on')).toBe(false);
    expect(supply({ mode: 'onRequest' }).canRequest('off')).toBe(false);
  });

  it('a granted request refills up to the cap', () => {
    const s = empty({ mode: 'onRequest' });
    s.grant('on');
    expect(s.count('on')).toBe(2);
  });

  it('other policies never refill on a tick', () => {
    expect(empty({ mode: 'never' }).refillOnce()).toBe(false);
    expect(empty({ mode: 'onRequest' }).refillOnce()).toBe(false);
  });
});

describe('Supply: exhaustion', () => {
  const limited: ChipKindConfig[] = [
    { id: 'a', label: 'A', count: 1 },
    { id: 'b', label: 'B', count: 0 },
  ];

  it('is exhausted only when nothing is left, nothing is in hand, and nothing can refill', () => {
    const s = new Supply({ kinds: limited, refill: resolveRefill({ mode: 'never' }) });
    expect(s.isExhausted()).toBe(false);
    s.reserve('a');
    expect(s.isExhausted()).toBe(false); // still in hand
    s.commit('a');
    expect(s.isExhausted()).toBe(true);
  });

  it('is never exhausted while chips can still arrive, or any kind is unlimited', () => {
    const empty: ChipKindConfig[] = [{ id: 'a', label: 'A', count: 0 }];
    for (const refill of [{ mode: 'onRequest' }, { mode: 'interval', everyMs: 1 }] as const) {
      expect(new Supply({ kinds: empty, refill: resolveRefill(refill) }).isExhausted()).toBe(false);
    }
    expect(supply({ mode: 'never' }).isExhausted()).toBe(false);
  });
});

describe('resolveRefill and checkCounts', () => {
  it('defaults to never, and amount to 1', () => {
    expect(resolveRefill(undefined)).toEqual({ mode: 'never' });
    expect(resolveRefill({ mode: 'interval', everyMs: 500 })).toEqual({
      mode: 'interval',
      everyMs: 500,
      amount: 1,
    });
  });

  it.each<RefillPolicy>([
    { mode: 'interval', everyMs: 0 },
    { mode: 'interval', everyMs: 100, amount: 0 },
    { mode: 'interval', everyMs: 100, max: -1 },
  ])('rejects %o', (refill) => {
    expect(() => resolveRefill(refill)).toThrow(PlinkoConfigError);
  });

  it('accepts whole counts and Infinity, rejects the rest', () => {
    expect(() => checkCounts([{ id: 'a', label: 'A', count: Infinity }])).not.toThrow();
    expect(() => checkCounts([{ id: 'a', label: 'A', count: -1 }])).toThrow(/"a".count/);
    expect(() => checkCounts([{ id: 'a', label: 'A', count: 2.5 }])).toThrow(/"a".count/);
  });
});
