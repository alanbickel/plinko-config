// Where things are drawn, in board units (see core/types.ts): the drawn area around the board, the
// tray below it, and the carry path a held chip travels from the tray up to the drop line.

import { type Layout, ROW_SPACING } from '../../core/layout';

export const SIDE = 0.25; // margin left and right of the walls
const TOP = 0.9; // space above the drop line for the held chip
export const FLOOR = 0.15;
export const TRAY_H = 1.95;
/** Tray chips' centre, below the top of the tray. */
export const TRAY_CHIP_DY = 0.65;
/** Rows of pegs one Shift+arrow carries the chip. */
const LARGE_LIFT_ROWS = 4;

/** The band under the floor that holds the slot labels; its size depends on the label layout. */
export interface LabelStrip {
  height: number;
  /** Room past the right wall, for labels that run down and to the right ('angled'). */
  extraRight: number;
}

/** The drawn area, in board units. */
export interface Viewport {
  x0: number;
  y0: number;
  w: number;
  h: number;
  trayY: number;
}

export interface GeometryInput {
  layout: Layout;
  strip: LabelStrip;
}

export function computeViewport({ layout, strip }: GeometryInput): Viewport {
  const y0 = layout.spawnY - TOP;
  const trayY = layout.floorY + FLOOR + strip.height;
  // The label room is mirrored on the left so the board stays centred.
  const side = SIDE + strip.extraRight;
  return { x0: -side, y0, w: layout.width + 2 * side, h: trayY + TRAY_H - y0, trayY };
}

/**
 * The vertical path of a held chip: lift 0 is the tray chips' centre, lift 1 the drop line. The
 * drop zone is the band above the first peg row, where a chip clears every peg.
 */
export interface CarryPath {
  bottomY: number;
  topY: number;
  /** Lift where the drop zone starts. */
  zoneFrom: number;
  /** Bottom edge of the drop zone, board units. */
  zoneY: number;
}

export function carryPath(input: GeometryInput): CarryPath {
  const { layout } = input;
  const bottomY = computeViewport(input).trayY + TRAY_CHIP_DY;
  const topY = layout.spawnY;
  const zoneY = (layout.pegRows[0] ?? layout.railTopY) - layout.pegRadius - layout.chipRadius;
  return { bottomY, topY, zoneY, zoneFrom: (bottomY - zoneY) / (bottomY - topY) };
}

export const liftToY = (path: CarryPath, lift: number): number =>
  path.bottomY + (path.topY - path.bottomY) * lift;

/** Lift at a board y, clamped to [0, 1]. */
export const yToLift = (path: CarryPath, y: number): number =>
  Math.min(1, Math.max(0, (path.bottomY - y) / (path.bottomY - path.topY)));

/** Default lift steps for a carry path: one peg row per arrow, a few with Shift. */
export function defaultLiftSteps(path: CarryPath): LiftSteps {
  const row = ROW_SPACING / (path.bottomY - path.topY);
  return { liftStep: row, liftStepLarge: Math.min(1, row * LARGE_LIFT_ROWS) };
}

export interface LiftSteps {
  liftStep: number;
  liftStepLarge: number;
}

/** A point in board units. */
export interface BoardPoint {
  x: number;
  y: number;
}

/** A lost chip falling off the board: drawn only, never simulated. */
export interface FallingChip {
  kindId: string;
  from: BoardPoint;
  /** performance.now() when it started to fall. */
  startedAt: number;
}

/** How long a lost chip takes to fall off the bottom of the canvas (or fade, reduced motion). */
export const FALL_MS = 600;
