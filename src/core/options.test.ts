import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARD, DEFAULT_PHYSICS, PlinkoConfigError, resolveCoreOptions } from './options';
import type { CoreOptions } from './types';

const base = (): CoreOptions => ({
  slots: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ],
  chips: [{ id: 'on', label: 'On' }],
});

const withOptions = (extra: Partial<CoreOptions>) => resolveCoreOptions({ ...base(), ...extra });

describe('resolveCoreOptions', () => {
  it('applies defaults', () => {
    const r = resolveCoreOptions(base());
    expect(r.board).toEqual(DEFAULT_BOARD);
    expect(r.physics).toMatchObject(DEFAULT_PHYSICS);
    expect(Number.isInteger(r.physics.seed)).toBe(true);
    expect(r.physics.bias).toEqual([1, 1, 1]);
  });

  it('keeps provided values and ignores undefined ones', () => {
    const r = withOptions({
      board: { rows: 5, chipRadius: undefined },
      physics: { gravity: 10, seed: 9 },
    });
    expect(r.board.rows).toBe(5);
    expect(r.board.chipRadius).toBe(DEFAULT_BOARD.chipRadius);
    expect(r.physics.gravity).toBe(10);
    expect(r.physics.seed).toBe(9);
  });

  it('resolves bias by slot id into per-index weights', () => {
    const r = withOptions({ physics: { bias: { c: 2, a: 0.5 } } });
    expect(r.physics.bias).toEqual([0.5, 1, 2]);
  });

  it('passes slots and chips through untouched', () => {
    const slots = [{ id: 'x', label: 'X', value: { deep: true } }];
    const r = resolveCoreOptions({ slots, chips: base().chips });
    expect(r.slots).toBe(slots);
  });

  it.each<[string, Partial<CoreOptions>, RegExp]>([
    ['empty slots', { slots: [] }, /slots must be a non-empty array/],
    ['empty chips', { chips: [] }, /chips must be a non-empty array/],
    [
      'duplicate slot ids',
      {
        slots: [
          { id: 'a', label: '' },
          { id: 'a', label: '' },
        ],
      },
      /duplicate id "a"/,
    ],
    ['blank id', { chips: [{ id: '', label: 'x' }] }, /chips\[0\]\.id/],
    ['fractional rows', { board: { rows: 2.5 } }, /board\.rows/],
    ['too many rows', { board: { rows: 41 } }, /board\.rows/],
    ['negative peg radius', { board: { pegRadius: -1 } }, /board\.pegRadius/],
    ['huge chip', { board: { chipRadius: 0.5 } }, /chipRadius must be at most/],
    [
      'chip that cannot pass pegs',
      { board: { chipRadius: 0.4, pegRadius: 0.15 } },
      /fit between pegs/,
    ],
    ['thick rails', { board: { railWidth: 0.5 } }, /railWidth/],
    ['zero gravity', { physics: { gravity: 0 } }, /gravity/],
    ['restitution above 1', { physics: { restitution: 1.5 } }, /restitution/],
    ['negative friction', { physics: { friction: -0.1 } }, /friction/],
    ['NaN jitter', { physics: { jitter: Number.NaN } }, /jitter/],
    ['fractional seed', { physics: { seed: 1.5 } }, /seed/],
    ['bias for unknown slot', { physics: { bias: { nope: 2 } } }, /unknown slot "nope"/],
    ['negative bias', { physics: { bias: { a: -1 } } }, /bias\["a"\]/],
  ])('rejects %s', (_, extra, message) => {
    expect(() => withOptions(extra)).toThrow(PlinkoConfigError);
    expect(() => withOptions(extra)).toThrow(message);
  });

  it('caps list sizes', () => {
    const slots = Array.from({ length: 51 }, (_, i) => ({ id: `s${i}`, label: '' }));
    expect(() => withOptions({ slots })).toThrow(/at most 50/);
  });
});
