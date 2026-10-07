// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../core/layout';
import { DEFAULT_BOARD } from '../../core/options';
import { resolveStyles } from '../styles';
import { DEFAULT_THEME } from '../theme';
import { CanvasView } from './canvas';
import { liftToY } from './geometry';
import { DEFAULT_SLOT_LABELS } from './slot-labels';

const SLOTS = 4;
const layout = buildLayout(SLOTS, DEFAULT_BOARD);

function view(width: number) {
  const v = new CanvasView({
    canvas: document.createElement('canvas'),
    layout,
    kinds: [
      { id: 'on', label: 'On' },
      { id: 'off', label: 'Off' },
    ],
    slots: Array.from({ length: SLOTS }, (_, i) => ({ id: `s${i}`, label: `S${i}` })),
    theme: DEFAULT_THEME,
    styles: resolveStyles({
      styles: undefined,
      theme: DEFAULT_THEME,
      slotIds: Array.from({ length: SLOTS }, (_, i) => `s${i}`),
      chipIds: ['on', 'off'],
    }),
    slotLabels: DEFAULT_SLOT_LABELS,
    reducedMotion: false,
  });
  return { v, height: v.resize({ cssWidth: width, remPx: 16, dpr: 2 }) };
}

describe('hitTest', () => {
  const width = 400;
  const { v, height } = view(width);
  /** CSS y of a board y: the drawn area starts above the drop line. */
  const cssY = (boardY: number) =>
    ((boardY - (layout.spawnY - 0.9)) / (layout.width + 0.5)) * width;

  it('maps the board area to drop positions, clamped to the drop range', () => {
    expect(v.hitTest({ x: width / 2, y: 5 })).toMatchObject({
      zone: 'board',
      x: expect.closeTo(0.5),
    });
    expect(v.hitTest({ x: 1, y: 5 })).toMatchObject({ zone: 'board', x: 0 });
    expect(v.hitTest({ x: width - 1, y: 5 })).toMatchObject({ zone: 'board', x: 1 });
  });

  it('maps height to lift along the carry path, clamped to [0, 1]', () => {
    const path = v.carry;
    expect(v.hitTest({ x: 50, y: 1 })?.lift).toBe(1);
    expect(v.hitTest({ x: 50, y: cssY(liftToY(path, 0.5)) })?.lift).toBeCloseTo(0.5);
    expect(v.hitTest({ x: 50, y: height - 1 })?.lift).toBe(0);
  });

  it('maps the bottom strip to tray columns, one per kind', () => {
    const y = height - 2;
    expect(v.hitTest({ x: width * 0.3, y })).toMatchObject({ zone: 'tray', index: 0 });
    expect(v.hitTest({ x: width * 0.7, y })).toMatchObject({ zone: 'tray', index: 1 });
    // The side margins belong to the nearest column.
    expect(v.hitTest({ x: 1, y })).toMatchObject({ zone: 'tray', index: 0 });
    expect(v.hitTest({ x: width - 1, y })).toMatchObject({ zone: 'tray', index: 1 });
  });

  it('returns null outside the canvas', () => {
    expect(v.hitTest({ x: -1, y: 5 })).toBeNull();
    expect(v.hitTest({ x: 5, y: height + 1 })).toBeNull();
  });

  it('follows the size the view was given', () => {
    const small = view(200);
    expect(small.v.hitTest({ x: 100, y: small.height - 2 })).toMatchObject({ index: 1 });
    expect(small.v.hitTest({ x: 99, y: small.height - 2 })).toMatchObject({ index: 0 });
  });
});

describe('carryPath', () => {
  it('runs from the tray up to the drop line, with the drop zone above the first peg row', () => {
    const path = view(400).v.carry;
    expect(liftToY(path, 1)).toBe(layout.spawnY);
    expect(liftToY(path, 0)).toBeGreaterThan(layout.floorY);
    expect(path.zoneY).toBeLessThan(layout.pegRows[0] ?? 0);
    expect(path.zoneFrom).toBeGreaterThan(0.8);
    expect(path.zoneFrom).toBeLessThan(1);
  });
});
