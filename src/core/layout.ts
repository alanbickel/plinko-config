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

/** Vertical distance between peg rows: an equilateral triangle lattice. */
export const ROW_SPACING = Math.sqrt(3) / 2;
const FIRST_ROW_Y = 1.5;
const SPAWN_Y = 0.5;
/**
 * Leaves a chip-sized gap to the nearest x.5 peg for any valid board, and keeps
 * bump + chip radius ≤ 1 for the world's 1-unit collision grid.
 */
const WALL_BUMP_RADIUS = 0.5;

/** Pegs and wall bumps, row by row. */
interface PegField {
  pegs: Circle[];
  wallBumps: Circle[];
  pegRows: number[];
}

/** Walls, floor, and rails below the pegs. */
interface Frame {
  boxes: Box[];
  railCaps: Circle[];
  railTopY: number;
  floorY: number;
}

interface BoardShape {
  slotCount: number;
  board: ResolvedBoard;
}

interface RowSpec extends BoardShape {
  y: number;
  /** x of the first peg: slot boundaries (1) or slot centres (0.5). */
  startX: number;
}

interface PegSite extends BoardShape {
  x: number;
  y: number;
}

interface FrameSpec extends BoardShape {
  lastRowY: number;
}

export function buildLayout(slotCount: number, board: ResolvedBoard): Layout {
  const { chipRadius, pegRadius } = board;
  const field = buildPegField({ slotCount, board });
  const frame = buildFrame({ slotCount, board, lastRowY: field.pegRows.at(-1) ?? FIRST_ROW_Y });
  const margin = chipRadius + 0.01;
  return {
    slotCount,
    width: slotCount,
    height: frame.floorY + 1,
    chipRadius,
    pegRadius,
    ...field,
    ...frame,
    spawnY: SPAWN_Y,
    dropMinX: margin,
    dropMaxX: slotCount - margin,
  };
}

/**
 * Rows alternate between pegs at slot centres (x.5) and pegs on slot boundaries (integers). The
 * last row sits on the boundaries, directly above the rails.
 */
function buildPegField(shape: BoardShape): PegField {
  const { rows } = shape.board;
  const field: PegField = { pegs: [], wallBumps: [], pegRows: [] };
  for (let i = 0; i < rows; i++) {
    const y = FIRST_ROW_Y + i * ROW_SPACING;
    field.pegRows.push(y);
    const onBoundaries = (rows - 1 - i) % 2 === 0;
    addRow(field, { ...shape, y, startX: onBoundaries ? 1 : 0.5 });
  }
  return field;
}

function addRow(field: PegField, row: RowSpec): void {
  for (let x = row.startX; x < row.slotCount; x++) placePeg(field, { ...row, x });
}

/**
 * A peg too close to a wall for a chip to pass would trap chips, so it becomes a bump set into
 * the wall instead. Bumps also keep chips from sliding straight down the walls.
 */
function placePeg(field: PegField, site: PegSite): void {
  const { x, y, slotCount, board } = site;
  if (fitsByWall(site)) {
    field.pegs.push({ x, y, r: board.pegRadius });
    return;
  }
  if (slotCount <= 1) return; // a one-slot board has no room for a bump; the row stays empty
  field.wallBumps.push({ x: x < slotCount / 2 ? 0 : slotCount, y, r: WALL_BUMP_RADIUS });
}

function fitsByWall({ x, slotCount, board }: PegSite): boolean {
  return Math.min(x, slotCount - x) - board.pegRadius >= 2 * board.chipRadius;
}

function buildFrame({ slotCount, board, lastRowY }: FrameSpec): Frame {
  const width = slotCount;
  const railTopY = lastRowY + ROW_SPACING;
  const floorY = railTopY + board.slotHeight;
  const top = SPAWN_Y - 2;
  const boxes: Box[] = [
    { x: -0.5, y: (top + floorY + 1) / 2, w: 1, h: floorY + 1 - top }, // left wall
    { x: width + 0.5, y: (top + floorY + 1) / 2, w: 1, h: floorY + 1 - top }, // right wall
    { x: width / 2, y: floorY + 0.5, w: width + 2, h: 1 }, // floor
  ];
  const railCaps: Circle[] = [];
  for (let x = 1; x < slotCount; x++) {
    boxes.push({ x, y: (railTopY + floorY) / 2, w: board.railWidth, h: floorY - railTopY });
    railCaps.push({ x, y: railTopY, r: board.railWidth / 2 });
  }
  return { boxes, railCaps, railTopY, floorY };
}

/** Maps a drop position in [0, 1] to board x. */
export function dropXToBoard(layout: Layout, x01: number): number {
  return lerp(layout.dropMinX, layout.dropMaxX, x01);
}

/** Maps board x to a drop position, clamped to [0, 1]. The inverse of dropXToBoard. */
export function boardToDropX(layout: Layout, x: number): number {
  return clamp((x - layout.dropMinX) / (layout.dropMaxX - layout.dropMinX), 0, 1);
}

/** Index of the slot column containing x. */
export function slotIndexAt(layout: Layout, x: number): number {
  return clamp(Math.floor(x), 0, layout.slotCount - 1);
}
