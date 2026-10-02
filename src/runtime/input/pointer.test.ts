import { describe, expect, it } from 'vitest';
import type { Hit } from '../view/canvas';
import type { InputAction } from './actions';
import { move, press, release } from './pointer';

const hit = (extra: Partial<Hit>): Hit => ({
  zone: 'board',
  index: 0,
  x: 0.5,
  lift: 0.5,
  point: { x: 1, y: 1 },
  ...extra,
});
const tray = (index: number) => hit({ zone: 'tray', index, lift: 0 });

describe('press', () => {
  it('on a tray chip picks it up', () => {
    expect(press(tray(1))).toEqual([{ type: 'pickUp', index: 1 }]);
  });

  it('anywhere else starts nothing', () => {
    expect(press(hit({ zone: 'board' }))).toBeNull();
    expect(press(null)).toBeNull();
  });
});

describe('move', () => {
  it('carries the chip to the pointer', () => {
    expect(move(hit({ x: 0.2, lift: 0.7 }))).toEqual([{ type: 'carry', x: 0.2, lift: 0.7 }]);
  });

  it('off the canvas leaves it where it was', () => {
    expect(move(null)).toEqual([]);
  });
});

describe('release', () => {
  const cases: ReleaseCase[] = [
    {
      name: 'over the board carries there and drops, without reloading',
      at: hit({ x: 0.3, lift: 0.95 }),
      actions: [
        { type: 'carry', x: 0.3, lift: 0.95 },
        { type: 'drop', reload: false },
      ],
    },
    {
      name: 'over the tray puts it back (a tap included)',
      at: tray(0),
      actions: [{ type: 'cancel' }],
    },
    { name: 'off the canvas loses it', at: null, actions: [{ type: 'lose' }] },
  ];
  it.each(cases)('$name', ({ at, actions }) => {
    expect(release(at, true)).toEqual(actions);
  });

  it('does nothing when nothing is held (e.g. the pickup found none left)', () => {
    expect(release(hit({}), false)).toEqual([]);
  });
});

interface ReleaseCase {
  name: string;
  at: Hit | null;
  actions: InputAction[];
}
