// Draws the whole interactive board, tray included, on one canvas. Units are board units
// (see core/types.ts); the view maps them to device pixels.

import { boardToDropX, type Circle, dropXToBoard, type Layout } from '../../core/layout';
import type { ChipKindConfig, SlotConfig } from '../../core/types';
import type { ChipBody } from '../../core/world';
import type { Zone } from '../input/actions';
import type { ResolvedChipStyle, ResolvedStyles, ResolvedText } from '../styles';
import type { Theme } from '../theme';
import {
  type BannerLayout,
  type BoardPoint,
  bannerLayout,
  type CarryPath,
  carryPath,
  computeViewport,
  FALL_MS,
  type FallingChip,
  FLOOR,
  liftToY,
  TRAY_CHIP_DY,
  TRAY_CHIP_R,
  type TrayLayout,
  trayLayout,
  type Viewport,
  yToLift,
} from './geometry';
import {
  drawSlotLabels,
  drawText,
  fitText,
  type LabelPlan,
  type Measure,
  measureLabels,
  planSlotLabels,
  type ResolvedSlotLabels,
  setFont,
  textWidth,
} from './slot-labels';

const WALL = 0.12; // drawn wall thickness (the physics walls are thicker)
/** Opacity of an empty kind in the tray. */
const EMPTY_ALPHA = 0.35;
/** How long a peg stays lit after a hit. */
export const PEG_FLASH_MS = 120;

export interface HeldChip {
  kindId: string;
  /** Aim, 0..1 across the top of the board. */
  x: number;
  /** Height on the carry path, 0 (tray) to 1 (drop line). */
  lift: number;
  /** Under the pointer during a drag, board units; otherwise drawn from x and lift. */
  at: BoardPoint | undefined;
}

/** The drop zone: hidden with nothing held, outlined while holding, lit with the chip inside. */
export type DropZoneLook = 'hidden' | 'shown' | 'lit';

export interface FrameState {
  flying: readonly ChipBody[];
  settled: readonly ChipBody[];
  held: HeldChip | undefined;
  dropZone: DropZoneLook;
  falling: readonly FallingChip[];
  selected: number;
  zone: Zone;
  focused: boolean;
  /** Chips left per kind; Infinity when unlimited. */
  counts: readonly number[];
  /** Small print under each kind in the tray (e.g. how to request more). */
  trayNotes: readonly (string | undefined)[];
  /** Message shown over the board once it's full. */
  lockedMessage: string | undefined;
  /** performance.now() of each peg's latest hit. */
  pegHits: ReadonlyMap<number, number>;
  alpha: number;
  now: number;
}

/** A point on the canvas in CSS pixels, from its top-left corner. */
export interface CssPoint {
  x: number;
  y: number;
}
/** What's under a point on the canvas. */
export interface Hit {
  /** The tray strip at the bottom, or anywhere above it. */
  zone: Zone;
  /** The tray column under the point (the nearest one from the side margins). */
  index: number;
  /** Drop position, 0..1, clamped to the drop range. */
  x: number;
  /** Height on the carry path, clamped to [0, 1]. */
  lift: number;
  point: BoardPoint;
}

export interface CanvasViewInput {
  canvas: HTMLCanvasElement;
  layout: Layout;
  kinds: readonly ChipKindConfig<unknown>[];
  slots: readonly SlotConfig<unknown>[];
  theme: Theme;
  /** Per-slot and per-chip looks, already layered over the theme. */
  styles: ResolvedStyles;
  slotLabels: ResolvedSlotLabels;
  reducedMotion: boolean;
}

/** Everything that decides colors and fonts; replaced as a whole by board.update(). */
export interface Look {
  theme: Theme;
  styles: ResolvedStyles;
}

/** Where everything goes; recomputed when the label plan changes the label strip. */
interface Geometry {
  viewport: Viewport;
  carry: CarryPath;
  plan: LabelPlan;
  tray: TrayLayout;
  banner: BannerLayout;
}

interface PainterInput extends CanvasViewInput, Geometry {
  g: CanvasRenderingContext2D;
}

/** Without a 2D context (jsdom) there's nothing to measure with: estimate from the length. */
const estimate: Measure = ({ text, size }) => text.length * size * 0.55;

interface Stroke {
  color: string;
  width: number;
}

/** The canvas width and root font size the board is laid out for. */
export interface CanvasSize {
  /** CSS pixels. */
  cssWidth: number;
  /** CSS pixels per rem. */
  remPx: number;
}

export interface ResizeInput extends CanvasSize {
  dpr: number;
}

export class CanvasView {
  private geometry: Geometry;
  /** Absent when there's no 2D context (e.g. jsdom); the view then just doesn't draw. */
  private readonly painter: Painter | undefined;
  private readonly measure: Measure;
  /** Slot label widths at font size 1; measured again when fonts or labels change. */
  private widths: number[];
  /** Set by resize. */
  private size: CanvasSize = { cssWidth: 1, remPx: 16 };

  constructor(private input: CanvasViewInput) {
    const g = input.canvas.getContext('2d');
    this.measure = g ? measureWith(g) : estimate;
    this.widths = this.measureLabels();
    this.geometry = this.computeGeometry(this.size);
    this.painter = g ? new Painter({ ...input, ...this.geometry, g }) : undefined;
  }

  /** CSS height of everything drawn, tray included, at a canvas size. */
  heightAt(size: CanvasSize): number {
    const { viewport } = this.computeGeometry(size);
    return (size.cssWidth * viewport.h) / viewport.w;
  }

  /** The held chip's path from the tray to the drop line; moves with the label strip. */
  get carry(): CarryPath {
    return this.geometry.carry;
  }

  private get viewport(): Viewport {
    return this.geometry.viewport;
  }

  private measureLabels(): number[] {
    const { slots, styles } = this.input;
    return measureLabels({
      labels: slots.map((slot) => slot.label),
      styles: slots.map((_, i) => styles.slots[i]?.label ?? styles.text),
      measure: this.measure,
    });
  }

  /** Plans the labels, then lays out everything around their strip. */
  private computeGeometry({ cssWidth, remPx }: CanvasSize): Geometry {
    const { layout, slotLabels } = this.input;
    const options = slotLabels;
    const plan = planSlotLabels({ widths: this.widths, options, layout, remPx, cssWidth });
    const scale = { unit: plan.unit, remPx };
    const tray = trayLayout(scale);
    const geometry = { layout, strip: plan.strip, trayHeight: tray.height };
    const banner = bannerLayout(scale);
    return { viewport: computeViewport(geometry), carry: carryPath(geometry), plan, tray, banner };
  }

  /** Re-plans after the labels' fonts or layout change. True if the board's shape changed. */
  private relayout(): boolean {
    const before = this.viewport;
    this.widths = this.measureLabels();
    this.geometry = this.computeGeometry(this.size);
    this.painter?.setGeometry(this.geometry);
    return before.w !== this.viewport.w || before.h !== this.viewport.h;
  }

  /** Lays the board out for a canvas size and sizes the backing store; returns the CSS height. */
  resize({ dpr, ...size }: ResizeInput): number {
    const { canvas } = this.input;
    this.size = size;
    this.geometry = this.computeGeometry(size);
    this.painter?.setGeometry(this.geometry);
    const cssHeight = (size.cssWidth * this.viewport.h) / this.viewport.w;
    canvas.width = Math.max(1, Math.round(size.cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.painter?.setScale(canvas.width / this.viewport.w);
    return cssHeight;
  }

  render(frame: FrameState): void {
    this.painter?.paint(frame);
  }

  /** New colors and fonts from the next frame on (board.update). True if the board must refit. */
  setLook(look: Look): boolean {
    this.input = { ...this.input, ...look };
    this.painter?.setLook(look);
    return this.relayout();
  }

  /** A new label layout (board.update). True if the board must refit. */
  setSlotLabels(slotLabels: ResolvedSlotLabels): boolean {
    this.input = { ...this.input, slotLabels };
    return this.relayout();
  }

  /** Peg flashes and falling lost chips follow this from the next frame on. */
  setReducedMotion(reducedMotion: boolean): void {
    this.input = { ...this.input, reducedMotion };
    this.painter?.setReducedMotion(reducedMotion);
  }

  /** What's under a point, or null outside the canvas. */
  hitTest(css: CssPoint): Hit | null {
    const { layout, kinds } = this.input;
    const { x0, y0, w, h, trayY } = this.viewport;
    const scale = w / this.size.cssWidth;
    const point = { x: x0 + css.x * scale, y: y0 + css.y * scale };
    if (point.x < x0 || point.x > x0 + w || point.y < y0 || point.y > y0 + h) return null;
    const column = Math.floor((point.x / layout.width) * kinds.length);
    return {
      zone: point.y < trayY ? 'board' : 'tray',
      index: Math.min(kinds.length - 1, Math.max(0, column)),
      x: boardToDropX(layout, point.x),
      lift: yToLift(this.geometry.carry, point.y),
      point,
    };
  }
}

class Painter {
  private readonly chipStyles = new Map<string, ResolvedChipStyle>();
  private scale = 1;

  constructor(private input: PainterInput) {
    this.setLook(input);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.input = { ...this.input, reducedMotion };
  }

  setLook({ theme, styles }: Look): void {
    this.input = { ...this.input, theme, styles };
    this.input.kinds.forEach((kind, i) => {
      const style = styles.chips[i];
      if (style) this.chipStyles.set(kind.id, style);
    });
  }

  setGeometry(geometry: Geometry): void {
    this.input = { ...this.input, ...geometry };
  }

  /** Device pixels per board unit. */
  setScale(device: number): void {
    this.scale = device;
  }

  paint(frame: FrameState): void {
    this.clear();
    this.drawDropZone(frame.dropZone);
    this.drawSlotFills();
    this.drawFrame();
    // Backboard labels are printed on the slots' back walls, behind rails and chips.
    const backboard = this.input.plan.mode === 'backboard';
    if (backboard) this.drawSlotLabels();
    this.drawRails();
    this.drawPegs(frame);
    this.drawChips(frame);
    if (!backboard) this.drawSlotLabels();
    this.drawTray(frame);
    // In hand and falling chips pass in front of everything, the tray included.
    this.drawHeld(frame);
    this.drawFalling(frame);
    if (frame.lockedMessage) this.drawBanner(frame.lockedMessage);
  }

  private clear(): void {
    const { g, canvas, theme, viewport } = this.input;
    const s = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = theme.background;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(s, 0, 0, s, -viewport.x0 * s, -viewport.y0 * s);
  }

  /** Walls and floor, drawn thinner than the physics walls; bumps on top, cut off at the walls. */
  private drawFrame(): void {
    const { g, layout, theme } = this.input;
    const top = layout.spawnY - 0.2;
    g.fillStyle = theme.wall;
    g.fillRect(-WALL, top, WALL, layout.floorY - top);
    g.fillRect(layout.width, top, WALL, layout.floorY - top);
    g.fillRect(-WALL, layout.floorY, layout.width + 2 * WALL, FLOOR);
    g.save();
    g.beginPath();
    g.rect(-WALL, top, layout.width + 2 * WALL, layout.floorY - top);
    g.clip();
    for (const bump of layout.wallBumps) this.circle(bump, theme.wall);
    g.restore();
  }

  private drawRails(): void {
    const { g, layout, theme } = this.input;
    for (const cap of layout.railCaps) {
      g.fillStyle = theme.rail;
      g.fillRect(cap.x - cap.r, layout.railTopY, 2 * cap.r, layout.floorY - layout.railTopY);
      this.circle(cap, theme.rail);
    }
  }

  private drawPegs(frame: FrameState): void {
    const { layout, theme, reducedMotion } = this.input;
    layout.pegs.forEach((peg, i) => {
      const lit = !reducedMotion && frame.now - (frame.pegHits.get(i) ?? -Infinity) < PEG_FLASH_MS;
      this.circle(peg, lit ? theme.pegHit : theme.peg);
    });
  }

  private drawChips(frame: FrameState): void {
    const r = this.input.layout.chipRadius;
    for (const c of frame.settled) this.chip({ ...c.pos, r }, c.kindId);
    for (const c of frame.flying) this.chip({ ...interpolate(c, frame.alpha), r }, c.kindId);
  }

  /** The band a chip can drop from: outlined while one is held, lit while it's inside. */
  private drawDropZone(look: DropZoneLook): void {
    if (look === 'hidden') return;
    const { g, layout, theme, viewport, carry } = this.input;
    const lit = look === 'lit';
    const y = viewport.y0 + 0.05;
    const h = carry.zoneY - y;
    g.globalAlpha = lit ? 0.18 : 0;
    g.fillStyle = theme.dropZone;
    g.fillRect(0, y, layout.width, h);
    g.globalAlpha = lit ? 1 : 0.45;
    g.setLineDash(lit ? [] : [0.15, 0.12]);
    g.strokeStyle = theme.dropZone;
    g.lineWidth = lit ? 0.05 : 0.03;
    g.strokeRect(0, y, layout.width, h);
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  private drawHeld(frame: FrameState): void {
    const { layout, carry } = this.input;
    if (!frame.held) return;
    const { x, lift, at, kindId } = frame.held;
    const centre = at ?? { x: dropXToBoard(layout, x), y: liftToY(carry, lift) };
    const circle: Circle = { ...centre, r: layout.chipRadius };
    this.chip(circle, kindId);
    if (frame.focused && !at) this.ring(grow(circle, 0.1), this.focusStroke());
  }

  /** Lost chips drop off the bottom of the canvas (or fade where they are, for reduced motion). */
  private drawFalling(frame: FrameState): void {
    const { g, layout, viewport, reducedMotion } = this.input;
    const r = layout.chipRadius;
    const bottom = viewport.y0 + viewport.h + r;
    for (const chip of frame.falling) {
      const t = Math.min(1, (frame.now - chip.startedAt) / FALL_MS);
      const y = reducedMotion ? chip.from.y : chip.from.y + (bottom - chip.from.y) * t * t;
      g.globalAlpha = reducedMotion ? 1 - t : 1;
      this.chip({ x: chip.from.x, y, r }, chip.kindId);
    }
    g.globalAlpha = 1;
  }

  /** Styled slots get a tint behind their column, from the rail tops to the floor. */
  private drawSlotFills(): void {
    const { g, layout, styles } = this.input;
    styles.slots.forEach(({ fill }, i) => {
      if (!fill) return;
      g.fillStyle = fill;
      g.fillRect(i, layout.railTopY, 1, layout.floorY - layout.railTopY);
    });
  }

  private drawSlotLabels(): void {
    const { g, layout, slots, styles, plan } = this.input;
    drawSlotLabels({
      g,
      plan,
      labels: slots.map((slot) => slot.label),
      styles: slots.map((_, i) => styles.slots[i]?.label ?? styles.text),
      layout,
      stripTop: layout.floorY + FLOOR,
    });
  }

  private drawTray(frame: FrameState): void {
    const { g, kinds, theme, viewport } = this.input;
    g.fillStyle = theme.tray;
    g.fillRect(viewport.x0, viewport.trayY, viewport.w, this.input.tray.height);
    kinds.forEach((kind, i) => {
      this.drawTrayChip({ kind, index: i, frame });
    });
  }

  private drawTrayChip({ kind, index, frame }: TrayChipInput): void {
    const { g, layout, kinds, styles } = this.input;
    const cell = layout.width / kinds.length;
    const at: Circle = {
      x: cell * (index + 0.5),
      y: this.input.viewport.trayY + TRAY_CHIP_DY,
      r: TRAY_CHIP_R,
    };
    const selected = index === frame.selected;
    const count = frame.counts[index] ?? 0;
    g.globalAlpha = count === 0 ? EMPTY_ALPHA : 1;
    this.chip(at, kind.id);
    g.globalAlpha = 1;
    if (selected) this.drawSelection({ at, frame });
    const caption = captionStyle({ label: styles.chips[index]?.label, selected, styles });
    const text = `${kind.label} ×${formatCount(count)}`;
    this.drawTrayText({
      x: at.x,
      cell,
      caption: { text, style: caption },
      note: frame.trayNotes[index],
    });
  }

  /** A tray kind's caption, and its note if it has one, on the tray's two text lines. */
  private drawTrayText({ x, cell, caption, note }: TrayTextInput): void {
    const { tray, viewport, styles } = this.input;
    const maxWidth = cell * 0.95;
    const captionAt = { x, y: viewport.trayY + tray.captionY };
    this.line({ ...caption, size: tray.captionSize, maxWidth, at: captionAt });
    if (!note) return;
    const noteAt = { x, y: viewport.trayY + tray.noteY };
    this.line({ text: note, style: styles.mutedText, size: tray.noteSize, maxWidth, at: noteAt });
  }

  /** The selected tray kind: a focus ring while the tray has focus, a quiet ring otherwise. */
  private drawSelection({ at, frame }: SelectionInput): void {
    const trayFocused = frame.focused && frame.zone === 'tray';
    const muted: Stroke = { color: this.input.theme.mutedText, width: 0.03 };
    this.ring(grow(at, trayFocused ? 0.1 : 0.08), trayFocused ? this.focusStroke() : muted);
  }

  private drawBanner(message: string): void {
    const { g, layout, theme, viewport, banner } = this.input;
    const y = (layout.spawnY + layout.railTopY) / 2;
    g.fillStyle = theme.overlay;
    g.fillRect(viewport.x0, y - banner.band / 2, viewport.w, banner.band);
    const style = { ...this.input.styles.text, fontWeight: '600' };
    const at = { x: layout.width / 2, y };
    this.line({ text: message, style, size: banner.size, maxWidth: viewport.w - 0.4, at });
  }

  /** One centered line: shrunk to fit (never below the minimum size), then cut with "…". */
  private line({ text, style, size, maxWidth, at }: LineInput): void {
    const { g } = this.input;
    const minSize = this.input.plan.minSize;
    const fitted = fitText({ g, text, style, size, maxWidth, minSize });
    g.save();
    g.translate(at.x, at.y);
    drawText(g, { ...fitted, style, align: 'center' });
    g.restore();
  }

  private focusStroke(): Stroke {
    return { color: this.input.theme.focus, width: 0.06 };
  }

  private chip(at: Circle, kindId: string): void {
    const { theme } = this.input;
    const style = this.chipStyles.get(kindId);
    this.circle(at, style?.fill ?? theme.chip);
    this.ring(at, { color: style?.stroke ?? theme.chipStroke, width: 0.03 });
  }

  private circle({ x, y, r }: Circle, color: string): void {
    const { g } = this.input;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  }

  private ring({ x, y, r }: Circle, stroke: Stroke): void {
    const { g } = this.input;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = stroke.color;
    g.lineWidth = stroke.width;
    g.stroke();
  }
}

/** Some text in a style: a tray caption. */
interface StyledText {
  text: string;
  style: ResolvedText;
}

interface TrayTextInput {
  /** Center of the tray kind's column, board units. */
  x: number;
  /** Width of the column, board units. */
  cell: number;
  caption: StyledText;
  note: string | undefined;
}

interface LineInput {
  text: string;
  style: ResolvedText;
  size: number;
  maxWidth: number;
  at: BoardPoint;
}

function measureWith(g: CanvasRenderingContext2D): Measure {
  return ({ text, style, size }) => {
    setFont(g, { style, size });
    return textWidth(g, text);
  };
}

interface TrayChipInput {
  kind: ChipKindConfig<unknown>;
  index: number;
  frame: FrameState;
}

interface SelectionInput {
  at: Circle;
  frame: FrameState;
}

interface Point {
  x: number;
  y: number;
}

/** Where a flying chip is drawn: alpha of the way from its previous step to its latest. */
function interpolate(chip: ChipBody, alpha: number): Point {
  return {
    x: chip.prevPos.x + (chip.pos.x - chip.prevPos.x) * alpha,
    y: chip.prevPos.y + (chip.pos.y - chip.prevPos.y) * alpha,
  };
}

const grow = (c: Circle, by: number): Circle => ({ ...c, r: c.r + by });

const formatCount = (n: number): string => (n === Infinity ? '∞' : String(n));

interface CaptionInput {
  label: ResolvedText | undefined;
  selected: boolean;
  styles: ResolvedStyles;
}

/** A tray caption: the kind's label style when selected; muted otherwise, in the kind's font. */
function captionStyle({ label, selected, styles }: CaptionInput): ResolvedText {
  const own = label ?? styles.text;
  return selected ? own : { ...own, color: styles.mutedText.color };
}
