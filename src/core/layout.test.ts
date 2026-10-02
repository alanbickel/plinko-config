import { describe, expect, it } from 'vitest';
import {
  boardToDropX,
  buildLayout,
  type Circle,
  dropXToBoard,
  type Layout,
  slotIndexAt,
} from './layout';
import { DEFAULT_BOARD } from './options';
import type { ResolvedBoard } from './types';

const board = (extra: Partial<ResolvedBoard> = {}): ResolvedBoard => ({
  ...DEFAULT_BOARD,
  ...extra,
});

/** Horizontal extent of an obstacle in a row. */
interface Span {
  left: number;
  right: number;
}

const spanOf = (c: Circle): Span => ({ left: c.x - c.r, right: c.x + c.r });

/** Open gaps between neighbouring obstacles (and the wall faces) in the peg row at y. */
function rowGaps(layout: Layout, y: number): number[] {
  const row = [...layout.pegs, ...layout.wallBumps].filter((c) => c.y === y);
  const wallFaces: Span[] = [
    { left: 0, right: 0 },
    { left: layout.width, right: layout.width },
  ];
  const spans = [...wallFaces, ...row.map(spanOf)].sort((a, b) => a.left - b.left);
  const gaps: number[] = [];
  let reach = 0; // rightmost edge so far
  for (const span of spans) {
    gaps.push(span.left - reach);
    reach = Math.max(reach, span.right);
  }
  return gaps.filter((gap) => gap > 0);
}

describe('buildLayout', () => {
  it('builds a triangular lattice with the last row on slot boundaries', () => {
    const layout = buildLayout(7, board({ rows: 8 }));
    expect(layout.pegRows).toHaveLength(8);
    const [y0 = 0, y1 = 0] = layout.pegRows;
    expect(y1 - y0).toBeCloseTo(Math.sqrt(3) / 2);

    const lastY = layout.pegRows.at(-1);
    const lastRow = layout.pegs.filter((p) => p.y === lastY).map((p) => p.x);
    expect(lastRow).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('puts one rounded rail between each pair of slots', () => {
    const layout = buildLayout(5, board());
    expect(layout.railCaps.map((c) => c.x)).toEqual([1, 2, 3, 4]);
    expect(layout.railCaps.every((c) => c.y === layout.railTopY)).toBe(true);
    expect(layout.floorY).toBeGreaterThan(layout.railTopY);
  });

  it('replaces pegs too close to a wall with wall bumps', () => {
    const layout = buildLayout(7, board());
    // Default chips (r 0.3) can't pass a peg at x = 0.5, so those rows get bumps instead.
    expect(layout.pegs.some((p) => p.x === 0.5 || p.x === 6.5)).toBe(false);
    expect(layout.wallBumps.length).toBeGreaterThan(0);
    expect(layout.wallBumps.every((b) => b.x === 0 || b.x === 7)).toBe(true);
  });

  it('keeps edge pegs when small chips fit beside them', () => {
    const layout = buildLayout(7, board({ chipRadius: 0.15 }));
    expect(layout.pegs.some((p) => p.x === 0.5)).toBe(true);
    expect(layout.wallBumps).toHaveLength(0);
  });

  // Jam-free layout: in every row, neighbouring obstacles leave a chip-sized gap.
  it.each([
    [1, {}],
    [2, {}],
    [7, {}],
    [12, { rows: 15 }],
    [7, { chipRadius: 0.2 }],
    [7, { chipRadius: 0.45, pegRadius: 0.04 }],
  ])('leaves a passable gap between neighbours (%i slots, %o)', (slots, extra) => {
    const b = board(extra);
    const layout = buildLayout(slots, b);
    const gaps = layout.pegRows.flatMap((y) => rowGaps(layout, y));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2 * b.chipRadius);
  });

  it('keeps every static within reach of the 1-unit collision grid', () => {
    const b = board({ chipRadius: 0.45, pegRadius: 0.04 });
    const layout = buildLayout(7, b);
    for (const c of [...layout.pegs, ...layout.railCaps, ...layout.wallBumps]) {
      expect(c.r + b.chipRadius).toBeLessThanOrEqual(1);
    }
  });
});

describe('dropXToBoard', () => {
  it('keeps the chip inside the walls at both ends', () => {
    const layout = buildLayout(7, board());
    expect(dropXToBoard(layout, 0) - layout.chipRadius).toBeGreaterThan(0);
    expect(dropXToBoard(layout, 1) + layout.chipRadius).toBeLessThan(7);
    expect(dropXToBoard(layout, 0.5)).toBeCloseTo(3.5);
  });
});

describe('boardToDropX', () => {
  it('inverts dropXToBoard and clamps past the walls', () => {
    const layout = buildLayout(7, board());
    for (const x of [0, 0.25, 0.5, 1]) {
      expect(boardToDropX(layout, dropXToBoard(layout, x))).toBeCloseTo(x);
    }
    expect(boardToDropX(layout, -3)).toBe(0);
    expect(boardToDropX(layout, 99)).toBe(1);
  });
});

describe('slotIndexAt', () => {
  it('maps x to a slot column and clamps to the board', () => {
    const layout = buildLayout(4, board());
    expect(slotIndexAt(layout, 0.2)).toBe(0);
    expect(slotIndexAt(layout, 2.99)).toBe(2);
    expect(slotIndexAt(layout, -1)).toBe(0);
    expect(slotIndexAt(layout, 10)).toBe(3);
  });
});
