// Draws the whole interactive board, tray included, on one canvas. Units are board units
// (see core/types.ts); the view maps them to device pixels.

import { type Circle, dropXToBoard, type Layout } from '../../core/layout';
import type { ChipKindConfig, SlotConfig } from '../../core/types';
import type { ChipBody } from '../../core/world';
import type { Zone } from '../input/keyboard';
import type { Theme } from '../theme';

const SIDE = 0.25; // margin left and right of the walls
const TOP = 0.9; // space above the drop line for the held chip
const WALL = 0.12; // drawn wall thickness (the physics walls are thicker)
const FLOOR = 0.15;
const LABEL_H = 0.7; // slot label strip
const TRAY_H = 1.95;
const TRAY_CHIP_R = 0.32;
const FONT = '0.26px system-ui, sans-serif';
const NOTE_FONT = '0.2px system-ui, sans-serif';
/** Opacity of an empty kind in the tray. */
const EMPTY_ALPHA = 0.35;
const BANNER_FONT = '600 0.34px system-ui, sans-serif';
/** How long a peg stays lit after a hit. */
export const PEG_FLASH_MS = 120;

export interface HeldChip {
  kindId: string;
  /** Aim, 0..1 across the top of the board. */
  x: number;
}

export interface FrameState {
  flying: readonly ChipBody[];
  settled: readonly ChipBody[];
  held: HeldChip | undefined;
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

export interface CanvasViewInput {
  canvas: HTMLCanvasElement;
  layout: Layout;
  kinds: readonly ChipKindConfig<unknown>[];
  slots: readonly SlotConfig<unknown>[];
  theme: Theme;
  reducedMotion: boolean;
}

/** The drawn area, in board units. */
interface Viewport {
  x0: number;
  y0: number;
  w: number;
  h: number;
  trayY: number;
}

interface PainterInput extends CanvasViewInput {
  g: CanvasRenderingContext2D;
  viewport: Viewport;
}

interface Stroke {
  color: string;
  width: number;
}

function computeViewport(layout: Layout): Viewport {
  const y0 = layout.spawnY - TOP;
  const trayY = layout.floorY + FLOOR + LABEL_H;
  return { x0: -SIDE, y0, w: layout.width + 2 * SIDE, h: trayY + TRAY_H - y0, trayY };
}

export class CanvasView {
  private readonly viewport: Viewport;
  /** Absent when there's no 2D context (e.g. jsdom); the view then just doesn't draw. */
  private readonly painter: Painter | undefined;

  constructor(private readonly input: CanvasViewInput) {
    this.viewport = computeViewport(input.layout);
    const g = input.canvas.getContext('2d');
    this.painter = g ? new Painter({ ...input, g, viewport: this.viewport }) : undefined;
  }

  /** Width ÷ height of everything drawn, tray included. */
  get aspect(): number {
    return this.viewport.w / this.viewport.h;
  }

  /** Sizes the backing store for a CSS width; returns the CSS height to use. */
  resize(cssWidth: number, dpr: number): number {
    const { canvas } = this.input;
    const cssHeight = (cssWidth * this.viewport.h) / this.viewport.w;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.painter?.setScale(canvas.width / this.viewport.w);
    return cssHeight;
  }

  render(frame: FrameState): void {
    this.painter?.paint(frame);
  }
}

class Painter {
  private readonly kindColor = new Map<string, string>();
  private scale = 1;

  constructor(private readonly input: PainterInput) {
    for (const k of input.kinds) this.kindColor.set(k.id, k.color ?? input.theme.chip);
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  paint(frame: FrameState): void {
    this.clear();
    this.drawFrame();
    this.drawRails();
    this.drawPegs(frame);
    this.drawChips(frame);
    this.drawHeld(frame);
    this.drawSlotLabels();
    this.drawTray(frame);
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

  /** Walls and floor, drawn thinner than the physics walls; bumps on top. */
  private drawFrame(): void {
    const { g, layout, theme } = this.input;
    const top = layout.spawnY - 0.2;
    g.fillStyle = theme.wall;
    g.fillRect(-WALL, top, WALL, layout.floorY - top);
    g.fillRect(layout.width, top, WALL, layout.floorY - top);
    g.fillRect(-WALL, layout.floorY, layout.width + 2 * WALL, FLOOR);
    for (const bump of layout.wallBumps) this.circle(bump, theme.wall);
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

  private drawHeld(frame: FrameState): void {
    const { layout } = this.input;
    if (!frame.held) return;
    const at: Circle = {
      x: dropXToBoard(layout, frame.held.x),
      y: layout.spawnY,
      r: layout.chipRadius,
    };
    this.chip(at, frame.held.kindId);
    if (frame.focused && frame.zone === 'board') this.ring(grow(at, 0.1), this.focusStroke());
  }

  private drawSlotLabels(): void {
    const { g, layout, slots, theme } = this.input;
    const y = layout.floorY + FLOOR + LABEL_H / 2;
    this.textStyle(FONT, theme.text);
    slots.forEach((slot, i) => {
      g.fillText(this.fit(slot.label, 0.95), i + 0.5, y);
    });
  }

  private drawTray(frame: FrameState): void {
    const { g, kinds, theme, viewport } = this.input;
    g.fillStyle = theme.tray;
    g.fillRect(viewport.x0, viewport.trayY, viewport.w, TRAY_H);
    kinds.forEach((kind, i) => {
      this.drawTrayChip({ kind, index: i, frame });
    });
  }

  private drawTrayChip({ kind, index, frame }: TrayChipInput): void {
    const { g, layout, kinds, theme } = this.input;
    const cell = layout.width / kinds.length;
    const at: Circle = {
      x: cell * (index + 0.5),
      y: this.input.viewport.trayY + 0.65,
      r: TRAY_CHIP_R,
    };
    const selected = index === frame.selected;
    const count = frame.counts[index] ?? 0;
    g.globalAlpha = count === 0 ? EMPTY_ALPHA : 1;
    this.chip(at, kind.id);
    g.globalAlpha = 1;
    if (selected) this.drawSelection({ at, frame });
    this.textStyle(FONT, selected ? theme.text : theme.mutedText);
    g.fillText(this.fit(`${kind.label} ×${formatCount(count)}`, cell * 0.95), at.x, at.y + 0.6);
    const note = frame.trayNotes[index];
    if (!note) return;
    this.textStyle(NOTE_FONT, theme.mutedText);
    g.fillText(this.fit(note, cell * 0.95), at.x, at.y + 0.95);
  }

  /** The selected tray kind: a focus ring while the tray has focus, a quiet ring otherwise. */
  private drawSelection({ at, frame }: SelectionInput): void {
    const trayFocused = frame.focused && frame.zone === 'tray';
    const muted: Stroke = { color: this.input.theme.mutedText, width: 0.03 };
    this.ring(grow(at, trayFocused ? 0.1 : 0.08), trayFocused ? this.focusStroke() : muted);
  }

  private drawBanner(message: string): void {
    const { g, layout, theme, viewport } = this.input;
    const y = (layout.spawnY + layout.railTopY) / 2;
    g.fillStyle = theme.overlay;
    g.fillRect(viewport.x0, y - 0.7, viewport.w, 1.4);
    this.textStyle(BANNER_FONT, theme.text);
    g.fillText(this.fit(message, viewport.w - 0.4), layout.width / 2, y);
  }

  private textStyle(font: string, color: string): void {
    const { g } = this.input;
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
  }

  /** Shortens text with an ellipsis to fit maxWidth (board units) in the current font. */
  private fit(text: string, maxWidth: number): string {
    const { g } = this.input;
    if (g.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
  }

  private focusStroke(): Stroke {
    return { color: this.input.theme.focus, width: 0.06 };
  }

  private chip(at: Circle, kindId: string): void {
    const { theme } = this.input;
    this.circle(at, this.kindColor.get(kindId) ?? theme.chip);
    this.ring(at, { color: theme.chipStroke, width: 0.03 });
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
