import type { ResolvedBoard } from './types';
import { clamp, lerp } from './vendor/littlejs/math';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Axis-aligned box centered on (x, y) with full width/height, like LittleJS. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  slotCount: number;
  /** Board interior spans x ∈ [0, width]; one slot per unit. */
  width: number;
  /** Bottom of the floor. */
  height: number;
  chipRadius: number;
  pegRadius: number;
  pegs: Circle[];
  /** Rounded rail tops: one circle per rail, so chips roll off instead of balancing. */
  railCaps: Circle[];
  /** Half-round bumps set into the walls, centered on the wall face. */
  wallBumps: Circle[];
  /** Walls, floor, and rail bodies. */
  boxes: Box[];
  /** y of each peg row. */
  pegRows: number[];
  spawnY: number;
  dropMinX: number;
  dropMaxX: number;
  railTopY: number;
  floorY: number;
}

const ROW_SPACING = Math.sqrt(3) / 2; // equilateral triangle lattice
const FIRST_ROW_Y = 1.5;
const SPAWN_Y = 0.5;
/**
 * Leaves a chip-sized gap to the nearest x.5 peg for any valid board, and keeps
 * bump + chip radius ≤ 1 for the world's 1-unit collision grid.
 */
const WALL_BUMP_RADIUS = 0.5;

export function buildLayout(slotCount: number, board: ResolvedBoard): Layout {
  const { rows, pegRadius, chipRadius, slotHeight, railWidth } = board;
  const width = slotCount;

  // Rows alternate between pegs at slot centers (x.5) and pegs on slot boundaries (integers).
  // The last row sits on the boundaries, directly above the rails.
  // A peg too close to a wall for a chip to pass would trap chips, so it becomes a bump set into
  // the wall instead. Bumps keep chips from sliding straight down the walls.
  const fitsByWall = (x: number) => Math.min(x, slotCount - x) - pegRadius >= 2 * chipRadius;
  const pegs: Circle[] = [];
  const wallBumps: Circle[] = [];
  const pegRows: number[] = [];
  for (let i = 0; i < rows; i++) {
    const y = FIRST_ROW_Y + i * ROW_SPACING;
    pegRows.push(y);
    const onBoundaries = (rows - 1 - i) % 2 === 0;
    for (let x = onBoundaries ? 1 : 0.5; x < slotCount; x++) {
      if (fitsByWall(x)) pegs.push({ x, y, r: pegRadius });
      // A one-slot board has no room for a bump; that row is left empty.
      else if (slotCount > 1) {
        wallBumps.push({ x: x < slotCount / 2 ? 0 : slotCount, y, r: WALL_BUMP_RADIUS });
      }
    }
  }

  const lastRowY = pegRows[pegRows.length - 1] ?? FIRST_ROW_Y;
  const railTopY = lastRowY + ROW_SPACING;
  const floorY = railTopY + slotHeight;
  const top = SPAWN_Y - 2;

  const boxes: Box[] = [
    { x: -0.5, y: (top + floorY + 1) / 2, w: 1, h: floorY + 1 - top }, // left wall
    { x: width + 0.5, y: (top + floorY + 1) / 2, w: 1, h: floorY + 1 - top }, // right wall
    { x: width / 2, y: floorY + 0.5, w: width + 2, h: 1 }, // floor
  ];
  const railCaps: Circle[] = [];
  for (let x = 1; x < slotCount; x++) {
    boxes.push({ x, y: (railTopY + floorY) / 2, w: railWidth, h: floorY - railTopY });
    railCaps.push({ x, y: railTopY, r: railWidth / 2 });
  }

  const margin = chipRadius + 0.01;
  return {
    slotCount,
    width,
    height: floorY + 1,
    chipRadius,
    pegRadius,
    pegs,
    railCaps,
    wallBumps,
    boxes,
    pegRows,
    spawnY: SPAWN_Y,
    dropMinX: margin,
    dropMaxX: width - margin,
    railTopY,
    floorY,
  };
}

/** Maps a drop position in [0, 1] to board x. */
export function dropXToBoard(layout: Layout, x01: number): number {
  return lerp(layout.dropMinX, layout.dropMaxX, x01);
}

/** Index of the slot column containing x. */
export function slotIndexAt(layout: Layout, x: number): number {
  return clamp(Math.floor(x), 0, layout.slotCount - 1);
}
