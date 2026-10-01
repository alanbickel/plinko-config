// Draws the whole interactive board, tray included, on one canvas. Units are board units
// (see core/types.ts); the view maps them to device pixels.

import { dropXToBoard, type Layout } from '../../core/layout';
import type { ChipKindConfig, SlotConfig } from '../../core/types';
import type { ChipBody } from '../../core/world';
import type { Zone } from '../input/keyboard';
import type { Theme } from '../theme';

const SIDE = 0.25; // margin left and right of the walls
const TOP = 0.9; // space above the drop line for the held chip
const WALL = 0.12; // drawn wall thickness (the physics walls are thicker)
const FLOOR = 0.15;
const LABEL_H = 0.7; // slot label strip
const TRAY_H = 1.7;
const TRAY_CHIP_R = 0.32;
const PEG_FLASH_MS = 120;

export interface FrameState {
  flying: readonly ChipBody[];
  settled: readonly ChipBody[];
  /** Held chip's aim, 0..1, or undefined when nothing is held. */
  heldX: number | undefined;
  heldKindId: string | undefined;
  selected: number;
  zone: Zone;
  focused: boolean;
  /** Chips left per kind; undefined means unlimited. */
  counts: readonly (number | undefined)[];
  /** Message shown over the board once it's full. */
  lockedMessage: string | undefined;
  /** performance.now() of each peg's latest hit. */
  pegHits: ReadonlyMap<number, number>;
  alpha: number;
  now: number;
}

export class CanvasView {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly x0: number;
  private readonly y0: number;
  private readonly w: number;
  private readonly h: number;
  private readonly trayY: number;
  private readonly kindColor = new Map<string, string>();
  private scale = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly layout: Layout,
    private readonly kinds: readonly ChipKindConfig<unknown>[],
    private readonly slots: readonly SlotConfig<unknown>[],
    private theme: Theme,
    private readonly reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext('2d');
    this.x0 = -SIDE;
    this.w = layout.width + 2 * SIDE;
    this.y0 = layout.spawnY - TOP;
    this.trayY = layout.floorY + FLOOR + LABEL_H;
    this.h = this.trayY + TRAY_H - this.y0;
    this.setTheme(theme);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    for (const k of this.kinds) this.kindColor.set(k.id, k.color ?? theme.chip);
  }

  /** Width ÷ height of everything drawn, tray included. */
  get aspect(): number {
    return this.w / this.h;
  }

  /** Sizes the backing store for a CSS width; returns the CSS height to use. */
  resize(cssWidth: number, dpr: number): number {
    const cssHeight = (cssWidth * this.h) / this.w;
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.scale = this.canvas.width / this.w;
    return cssHeight;
  }

  render(f: FrameState): void {
    const { ctx, layout, theme } = this;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, -this.x0 * s, -this.y0 * s);

    // Frame: walls and floor (drawn thin; bumps and rails on top).
    ctx.fillStyle = theme.wall;
    const top = layout.spawnY - 0.2;
    ctx.fillRect(-WALL, top, WALL, layout.floorY - top);
    ctx.fillRect(layout.width, top, WALL, layout.floorY - top);
    ctx.fillRect(-WALL, layout.floorY, layout.width + 2 * WALL, FLOOR);
    for (const b of layout.wallBumps) this.circle(b.x, b.y, b.r, theme.wall);

    ctx.fillStyle = theme.rail;
    for (const c of layout.railCaps) {
      ctx.fillRect(c.x - c.r, layout.railTopY, 2 * c.r, layout.floorY - layout.railTopY);
      this.circle(c.x, c.y, c.r, theme.rail);
    }

    layout.pegs.forEach((p, i) => {
      const hit = !this.reducedMotion && f.now - (f.pegHits.get(i) ?? -Infinity) < PEG_FLASH_MS;
      this.circle(p.x, p.y, p.r, hit ? theme.pegHit : theme.peg);
    });

    const r = layout.chipRadius;
    for (const c of f.settled) this.chip(c.pos.x, c.pos.y, r, c.kindId);
    for (const c of f.flying) {
      const x = c.prevPos.x + (c.pos.x - c.prevPos.x) * f.alpha;
      const y = c.prevPos.y + (c.pos.y - c.prevPos.y) * f.alpha;
      this.chip(x, y, r, c.kindId);
    }

    if (f.heldX !== undefined && f.heldKindId !== undefined) {
      const x = dropXToBoard(layout, f.heldX);
      this.chip(x, layout.spawnY, r, f.heldKindId);
      if (f.focused && f.zone === 'board') this.focusRing(x, layout.spawnY, r);
    }

    this.slotLabels();
    this.tray(f);
    if (f.lockedMessage) this.banner(f.lockedMessage);
  }

  private slotLabels(): void {
    const { ctx, theme, layout } = this;
    if (!ctx) return;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '0.26px system-ui, sans-serif';
    const y = layout.floorY + FLOOR + LABEL_H / 2;
    this.slots.forEach((slot, i) => {
      ctx.fillText(this.fit(slot.label, 0.95), i + 0.5, y);
    });
  }

  private tray(f: FrameState): void {
    const { ctx, theme, layout } = this;
    if (!ctx) return;
    ctx.fillStyle = theme.tray;
    ctx.fillRect(this.x0, this.trayY, this.w, TRAY_H);
    const cell = layout.width / this.kinds.length;
    const cy = this.trayY + 0.65;
    this.kinds.forEach((kind, i) => {
      const cx = cell * (i + 0.5);
      this.chip(cx, cy, TRAY_CHIP_R, kind.id);
      if (i === f.selected) {
        if (f.focused && f.zone === 'tray') this.focusRing(cx, cy, TRAY_CHIP_R);
        else this.ring(cx, cy, TRAY_CHIP_R + 0.08, theme.mutedText, 0.03);
      }
      const count = f.counts[i];
      ctx.fillStyle = i === f.selected ? theme.text : theme.mutedText;
      ctx.font = '0.26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `${kind.label} ×${count === undefined ? '∞' : count}`;
      ctx.fillText(this.fit(label, cell * 0.95), cx, cy + 0.65);
    });
  }

  private banner(message: string): void {
    const { ctx, theme, layout } = this;
    if (!ctx) return;
    const y = (layout.spawnY + layout.railTopY) / 2;
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(this.x0, y - 0.7, this.w, 1.4);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 0.34px system-ui, sans-serif';
    ctx.fillText(this.fit(message, this.w - 0.4), layout.width / 2, y);
  }

  /** Shortens text with an ellipsis to fit maxWidth (board units) in the current font. */
  private fit(text: string, maxWidth: number): string {
    const { ctx } = this;
    if (!ctx || ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
  }

  private chip(x: number, y: number, r: number, kindId: string): void {
    this.circle(x, y, r, this.kindColor.get(kindId) ?? this.theme.chip);
    this.ring(x, y, r, this.theme.chipStroke, 0.03);
  }

  private focusRing(x: number, y: number, r: number): void {
    this.ring(x, y, r + 0.1, this.theme.focus, 0.06);
  }

  private circle(x: number, y: number, r: number, color: string): void {
    const { ctx } = this;
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private ring(x: number, y: number, r: number, color: string, width: number): void {
    const { ctx } = this;
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
