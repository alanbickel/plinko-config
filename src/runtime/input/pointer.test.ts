import { describe, expect, it } from 'vitest';
import type { Hit } from '../view/canvas';
import type { InputAction } from './actions';
import { type Gesture, move, press, release } from './pointer';

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
    expect(press(tray(1), false)).toEqual([{ type: 'pickUp', index: 1 }]);
  });

  it('anywhere else starts nothing', () => {
    expect(press(hit({ zone: 'board' }), false)).toBeNull();
    expect(press(null, false)).toBeNull();
  });

  it('while a tapped chip is held, carries it to the pointer, tray included', () => {
    expect(press(hit({ x: 0.2, lift: 0.9 }), true)).toEqual([{ type: 'carry', x: 0.2, lift: 0.9 }]);
    expect(press(tray(1), true)).toEqual([{ type: 'carry', x: 0.5, lift: 0 }]);
    expect(press(null, true)).toBeNull();
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
  /** A press that carried a chip it was already holding, or one that left the tray. */
  const carried: Gesture = { holding: true, pickedUp: false, leftTray: true };
  const cases: ReleaseCase[] = [
    {
      name: 'over the board carries there and drops, without reloading',
      at: hit({ x: 0.3, lift: 0.95 }),
      actions: [
        { type: 'carry', x: 0.3, lift: 0.95 },
        { type: 'drop', reload: false },
      ],
    },
    { name: 'over the tray puts it back', at: tray(0), actions: [{ type: 'cancel' }] },
    { name: 'off the canvas loses it', at: null, actions: [{ type: 'lose' }] },
  ];
  it.each(cases)('$name', ({ at, actions }) => {
    expect(release(at, carried)).toEqual(actions);
  });

  it('after a tap on a tray chip keeps holding it, for a second tap to drop', () => {
    const tap: Gesture = { holding: true, pickedUp: true, leftTray: false };
    expect(release(tray(0), tap)).toEqual([]);
  });

  it("isn't a tap when released off the tray, even with no moves reported between", () => {
    const pickup: Gesture = { holding: true, pickedUp: true, leftTray: false };
    expect(release(hit({ x: 0.4, lift: 1 }), pickup)).toEqual([
      { type: 'carry', x: 0.4, lift: 1 },
      { type: 'drop', reload: false },
    ]);
  });

  it('puts the chip back when a drag from the tray returns to it', () => {
    const back: Gesture = { holding: true, pickedUp: true, leftTray: true };
    expect(release(tray(0), back)).toEqual([{ type: 'cancel' }]);
  });

  it('puts a held chip back on a second tap on the tray', () => {
    const second: Gesture = { holding: true, pickedUp: false, leftTray: false };
    expect(release(tray(1), second)).toEqual([{ type: 'cancel' }]);
  });

  it('does nothing when nothing is held (e.g. the pickup found none left)', () => {
    expect(release(hit({}), { holding: false, pickedUp: true, leftTray: false })).toEqual([]);
  });
});

interface ReleaseCase {
  name: string;
  at: Hit | null;
  actions: InputAction[];
}
